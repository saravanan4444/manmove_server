const router = require('express').Router();
const { authenticate, scopeToTenant, permitMatrix } = require('../config/authMiddleware');
const Nvr = require('../models/nvr');
const Camera = require('../models/camera');
const CameraMaintenance = require('../models/cameramaintenance');

const mw = [authenticate, scopeToTenant];

// Dashboard — must be before /:id
router.get('/nvrs/dashboard/:projectId', ...mw, async (req, res) => {
  try {
    const project_id = req.params.projectId;
    const nvrs = await Nvr.find({ project_id }).lean();
    const nvrIds = nvrs.map(n => n._id);

    const cameras = await Camera.find({ nvr_id: { $in: nvrIds } }, '_id nvr_id').lean();
    const camIds  = cameras.map(c => c._id);

    const faults = await CameraMaintenance.find({
      camera_id: { $in: camIds },
      status: { $nin: ['resolved', 'closed'] },
    }, 'camera_id').lean();

    const camCountMap  = {};
    cameras.forEach(c => { const k = c.nvr_id?.toString(); if (k) camCountMap[k] = (camCountMap[k] || 0) + 1; });

    const completedCountMap = {};
    cameras.forEach(c => { if (c.current_stage === 'completed') { const k = c.nvr_id?.toString(); if (k) completedCountMap[k] = (completedCountMap[k] || 0) + 1; } });

    const camToNvr = Object.fromEntries(cameras.map(c => [c._id.toString(), c.nvr_id?.toString()]));
    const faultCountMap = {};
    faults.forEach(f => { const k = camToNvr[f.camera_id?.toString()]; if (k) faultCountMap[k] = (faultCountMap[k] || 0) + 1; });

    const nvrList = nvrs.map(n => ({
      ...n,
      camera_count:    camCountMap[n._id.toString()]       || 0,
      completed_count: completedCountMap[n._id.toString()] || 0,
      fault_count:     faultCountMap[n._id.toString()]     || 0,
    }));

    res.status(200).json({ status: 200, data: {
      total:         nvrs.length,
      online:        nvrs.filter(n => n.status === 'online').length,
      offline:       nvrs.filter(n => n.status === 'offline').length,
      faulty:        nvrs.filter(n => n.status === 'faulty').length,
      total_cameras: cameras.length,
      open_faults:   faults.length,
      nvrs:          nvrList,
    }});
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/nvrs', ...mw, async (req, res) => {
  try {
    const { project_id, company, status } = req.query;
    const filter = {};
    if (project_id) filter.project_id = project_id;
    if (company)    filter.company    = company;
    if (status)     filter.status     = status;
    const data = await Nvr.find(filter).lean();
    res.status(200).json({ status: 200, data });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/nvrs', ...mw, permitMatrix('projects', 'create'), async (req, res) => {
  try {
    // Validate: software NVR must have health_endpoint, hardware must have ip_address
    if (req.body.nvr_type === 'software' && !req.body.health_endpoint)
      return res.status(200).json({ status: 400, message: 'Software NVR requires health_endpoint' });
    if ((!req.body.nvr_type || req.body.nvr_type === 'hardware') && !req.body.ip_address)
      return res.status(200).json({ status: 400, message: 'Hardware NVR requires ip_address' });
    const data = await Nvr.create(req.body);
    res.status(200).json({ status: 200, data });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/nvrs/:id', ...mw, permitMatrix('projects', 'update'), async (req, res) => {
  try {
    const data = await Nvr.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json({ status: 200, data });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.delete('/nvrs/:id', ...mw, permitMatrix('projects', 'delete'), async (req, res) => {
  try {
    await Nvr.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: 200, data: { deleted: true } });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/nvrs/:id/cameras', ...mw, async (req, res) => {
  try {
    const data = await Camera.find({ nvr_id: req.params.id }).lean();
    res.status(200).json({ status: 200, data });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/nvrs/:id/faults', ...mw, async (req, res) => {
  try {
    const cameras = await Camera.find({ nvr_id: req.params.id }, '_id').lean();
    const camIds = cameras.map(c => c._id);
    const data = await CameraMaintenance.find({
      camera_id: { $in: camIds },
      status: { $nin: ['resolved', 'closed'] },
    }).lean();
    res.status(200).json({ status: 200, data });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Tier 1: Recording schedule ────────────────────────────────────────────
router.put('/nvrs/:id/recording', ...mw, permitMatrix('projects', 'update'), async (req, res) => {
  try {
    const { recording_mode, retention_days, overwrite_policy } = req.body;
    const data = await Nvr.findByIdAndUpdate(
      req.params.id,
      { recording_mode, retention_days, overwrite_policy, updated_at: new Date() },
      { new: true }
    );
    res.status(200).json({ status: 200, data });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Tier 1: HDD slot health update ───────────────────────────────────────
router.put('/nvrs/:id/hdd', ...mw, permitMatrix('projects', 'update'), async (req, res) => {
  try {
    const slots = (req.body.hdd_slots || []).map(s => ({ ...s, last_checked: new Date() }));
    const totalCap  = slots.reduce((s, d) => s + (d.capacity_tb || 0), 0);
    const totalUsed = slots.reduce((s, d) => s + (d.used_tb || 0), 0);
    const data = await Nvr.findByIdAndUpdate(
      req.params.id,
      { hdd_slots: slots, hdd_capacity_tb: totalCap, hdd_used_tb: totalUsed, updated_at: new Date() },
      { new: true }
    );
    const io = req.app.get('io');
    const NocAlert = require('../models/nocAlert');
    const failingSlots = slots.filter(s => s.health_status === 'failing' || s.health_status === 'failed');
    await Promise.all(failingSlots.map(async slot => {
      const existing = await NocAlert.exists({ description: { $regex: `${data.nvr_number}.*HDD.*${slot.slot}` }, resolved_at: null });
      if (!existing) {
        const alert = await NocAlert.create({
          severity: slot.health_status === 'failed' ? 'critical' : 'warning',
          company:  data.company,
          description: `NVR ${data.nvr_number} — HDD Slot ${slot.slot} health: ${slot.health_status.toUpperCase()} (${slot.temperature_c}°C)`,
          source: 'nvr-hdd',
        });
        if (io) io.emit('noc:alert', alert);
      }
    }));
    res.status(200).json({ status: 200, data });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Failover pairing ──────────────────────────────────────────────────────
// Pair primary NVR with a standby NVR
router.put('/nvrs/:id/failover', ...mw, permitMatrix('projects', 'update'), async (req, res) => {
  try {
    const { standby_nvr_id } = req.body;
    if (!standby_nvr_id) return res.status(200).json({ status: 400, message: 'standby_nvr_id required' });
    await Promise.all([
      Nvr.findByIdAndUpdate(req.params.id,   { failover_nvr_id: standby_nvr_id, is_failover: false }),
      Nvr.findByIdAndUpdate(standby_nvr_id,  { failover_nvr_id: req.params.id,  is_failover: true  }),
    ]);
    res.status(200).json({ status: 200, message: 'Failover pair configured' });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// Remove failover pairing
router.delete('/nvrs/:id/failover', ...mw, permitMatrix('projects', 'update'), async (req, res) => {
  try {
    const nvr = await Nvr.findById(req.params.id).lean();
    if (nvr?.failover_nvr_id) await Nvr.findByIdAndUpdate(nvr.failover_nvr_id, { failover_nvr_id: null, is_failover: false });
    await Nvr.findByIdAndUpdate(req.params.id, { failover_nvr_id: null, is_failover: false });
    res.status(200).json({ status: 200, message: 'Failover pair removed' });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── On-demand health check (manual trigger) ───────────────────────────────
router.get('/nvrs/:id/health', ...mw, async (req, res) => {
  try {
    const nvr = await Nvr.findById(req.params.id).lean();
    if (!nvr) return res.status(200).json({ status: 404, message: 'NVR not found' });

    const { checkHttpHealth } = require('../monitoring/http-health');
    const { pingHost }        = require('../monitoring/ping');
    const { checkRtsp }       = require('../monitoring/rtsp-check');

    const result = { nvr_id: nvr._id, nvr_type: nvr.nvr_type };

    if (nvr.nvr_type === 'software' && nvr.health_endpoint) {
      const h = await checkHttpHealth(nvr.health_endpoint, nvr.health_token);
      result.http = h;
    } else {
      const p = await pingHost(nvr.ip_address, 3000);
      result.ping = p;
      if (p.alive) {
        result.rtsp = await checkRtsp(nvr.ip_address, nvr.rtsp_port || 554);
        result.onvif = await checkRtsp(nvr.ip_address, nvr.onvif_port || 80);
      }
    }

    res.status(200).json({ status: 200, data: result });
  } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
