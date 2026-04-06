const router       = require('express').Router();
const { authenticate, scopeToTenant, permitMatrix, SUPERADMIN_ROLES } = require('../config/authMiddleware');
const NocAlert     = require('../models/nocAlert');
const NocSla       = require('../models/nocSla');
const CameraHealth = require('../models/camerahealth');
const Camera       = require('../models/camera');
const { getCurrentStatus }       = require('../monitoring/camera-monitor');
const { getAllStrikes }           = require('../monitoring/alert-engine');
const { scanSubnet, getLocalSubnet, scanAllRanges } = require('../monitoring/network-scanner');

// ── Wrap all async handlers with try/catch ────────────────────────────────
const wrap = fn => (req, res, next) => fn(req, res, next).catch(err => res.status(200).json({ status: 500, message: err.message }));

router.get('/noc/stats', authenticate, scopeToTenant, wrap(async (req, res) => {
  const allStatuses = getCurrentStatus();
  const company = req.query.company;
  const statuses = company ? allStatuses.filter(s => s.company === company) : allStatuses;
  const alertQuery = { severity: 'critical', resolved_at: null };
  if (company) alertQuery.company = company;
  const [critical, unacked_alerts] = await Promise.all([
    NocAlert.countDocuments(alertQuery),
    NocAlert.countDocuments({ ...alertQuery, acknowledged: false }),
  ]);
  res.status(200).json({ status: 200, data: {
    total:   statuses.length,
    online:  statuses.filter(s => s.status === 'online').length,
    offline: statuses.filter(s => s.status === 'offline').length,
    warning: statuses.filter(s => s.status === 'stream_error').length,
    critical, unacked_alerts,
  }});
}));

router.get('/noc/wall', authenticate, scopeToTenant, wrap(async (req, res) => {
  const query = { monitoring_enabled: { $ne: false } };
  if (req.query.company) query.company = req.query.company;
  const cameras = await Camera.find(query).lean();
  const statusMap = new Map(getCurrentStatus().map(s => [String(s.camera_id), s]));
  res.status(200).json({ status: 200, data: cameras.map(c => ({ ...c, health: statusMap.get(String(c._id)) || null })) });
}));

router.get('/noc/alerts', authenticate, scopeToTenant, wrap(async (req, res) => {
  const query = { resolved_at: null };
  if (req.query.company) query.company = req.query.company;
  const data = await NocAlert.find(query).sort({ triggered_at: -1 }).limit(100).lean();
  res.status(200).json({ status: 200, data });
}));

router.get('/noc/alerts/history', authenticate, scopeToTenant, wrap(async (req, res) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const query = { triggered_at: { $gte: since } };
  if (req.query.company) query.company = req.query.company;
  const data = await NocAlert.find(query).sort({ triggered_at: -1 }).limit(500).lean();
  res.status(200).json({ status: 200, data });
}));

router.post('/noc/alerts/:id/ack', authenticate, permitMatrix('projects', 'update'), wrap(async (req, res) => {
  const data = await NocAlert.findByIdAndUpdate(
    req.params.id,
    { acknowledged: true, ack_by: req.user?.name || '', ack_at: new Date() },
    { new: true }
  );
  if (!data) return res.status(200).json({ status: 404, message: 'Alert not found' });
  res.status(200).json({ status: 200, data });
}));

router.post('/noc/alerts/:id/resolve', authenticate, permitMatrix('projects', 'update'), wrap(async (req, res) => {
  const resolved_at = new Date();
  const data = await NocAlert.findByIdAndUpdate(
    req.params.id,
    { resolved_at, acknowledged: true, ack_by: req.user?.name || '', ack_at: resolved_at },
    { new: true }
  );
  if (!data) return res.status(200).json({ status: 404, message: 'Alert not found' });
    const io = req.app.get('io');
    if (io) io.emit('noc:alert_resolved', { _id: req.params.id, resolved_at });
  res.status(200).json({ status: 200, data });
}));

router.get('/noc/shift-report', authenticate, scopeToTenant, wrap(async (req, res) => {
  const hours = parseInt(req.query.hours) || 8;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const company = req.query.company;
  const alertQuery = { triggered_at: { $gte: since } };
  const slaQuery   = { date: { $gte: since } };
  if (company) { alertQuery.company = company; slaQuery.company = company; }
  const [alerts, sla] = await Promise.all([
    NocAlert.find(alertQuery).sort({ triggered_at: -1 }).lean(),
    NocSla.find(slaQuery).lean(),
  ]);
  const statuses = getCurrentStatus().filter(s => !company || s.company === company);
  res.status(200).json({ status: 200, data: {
    period_hours: hours, since, generated_at: new Date(),
    camera_summary: {
      total:   statuses.length,
      online:  statuses.filter(s => s.status === 'online').length,
      offline: statuses.filter(s => s.status === 'offline').length,
      warning: statuses.filter(s => s.status === 'stream_error').length,
    },
    offline_cameras:   statuses.filter(s => s.status === 'offline'),
    alerts_raised:     alerts.length,
    critical_alerts:   alerts.filter(a => a.severity === 'critical').length,
    unresolved_alerts: alerts.filter(a => !a.resolved_at).length,
    alerts,
  }});
}));

router.get('/noc/strikes', authenticate, (req, res) => {
  const data = getAllStrikes ? getAllStrikes() : [];
  res.status(200).json({ status: 200, data });
});

router.get('/noc/sla/summary', authenticate, scopeToTenant, wrap(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const match = { date: { $gte: since } };
  if (req.query.company) match.company = req.query.company;
  const data = await NocSla.aggregate([
    { $match: match },
    { $group: { _id: '$camera_id', camera_number: { $last: '$camera_number' }, ip_address: { $last: '$ip_address' }, company: { $last: '$company' }, avg_uptime: { $avg: '$uptime_pct' }, avg_latency: { $avg: '$avg_latency' }, total_incidents: { $sum: '$incidents' } } }
  ]);
  res.status(200).json({ status: 200, data });
}));

router.get('/noc/sla/:cameraId', authenticate, wrap(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const data = await NocSla.find({ camera_id: req.params.cameraId, date: { $gte: since } }).sort({ date: -1 }).lean();
  res.status(200).json({ status: 200, data });
}));

router.get('/noc/latency/:cameraId', authenticate, wrap(async (req, res) => {
  const data = await CameraHealth.find({ camera_id: req.params.cameraId }).sort({ checked_at: -1 }).limit(50).lean();
  res.status(200).json({ status: 200, data });
}));

// ── Network Scanner ────────────────────────────────────────────────────────
let scanState = { running: false, progress: 0, total: 254, found: [], subnet: null, startedAt: null, mode: 'single' };

router.get('/noc/scan/status', authenticate, (req, res) => {
  res.status(200).json({ status: 200, data: scanState });
});

router.post('/noc/scan/start', authenticate, async (req, res) => {
  if (scanState.running) return res.status(200).json({ status: 200, message: 'Scan already running', data: scanState });
  const mode   = req.body.mode || 'single';
  const subnet = req.body.subnet || getLocalSubnet();
  const io     = req.app.get('io');

  function onProgress(scanned, total, newFound, currentSubnet) {
    scanState.progress = scanned;
    scanState.found.push(...newFound);
    if (io) io.emit('noc:scan_progress', { progress: scanned, total, found: newFound, currentSubnet });
  }
  function onComplete() {
    scanState.running = false;
    if (io) io.emit('noc:scan_complete', { total_found: scanState.found.length, found: scanState.found });
  }

  if (mode === 'all') {
    scanState = { running: true, progress: 0, total: 528, found: [], mode: 'all', startedAt: new Date() };
    res.status(200).json({ status: 200, message: 'Scanning all private IP ranges', data: scanState });
    scanAllRanges(onProgress).then(onComplete).catch(() => { scanState.running = false; });
  } else {
    scanState = { running: true, progress: 0, total: 254, found: [], subnet, mode: 'single', startedAt: new Date() };
    res.status(200).json({ status: 200, message: `Scanning ${subnet}.1–254`, data: scanState });
    scanSubnet(subnet, onProgress).then(onComplete).catch(() => { scanState.running = false; });
  }
});

module.exports = router;
