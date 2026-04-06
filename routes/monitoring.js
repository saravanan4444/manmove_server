const router       = require('express').Router();
const { authenticate, scopeToTenant } = require('../config/authMiddleware');
const CameraHealth = require('../models/camerahealth');
const Camera       = require('../models/camera');
const { getCurrentStatus } = require('../monitoring/camera-monitor');

const alertsBuffer = [];
function addAlert(alert) { alertsBuffer.unshift(alert); if (alertsBuffer.length > 100) alertsBuffer.pop(); }
function getAlerts() { return alertsBuffer; }

router.get('/monitoring/stats', authenticate, scopeToTenant, (req, res) => {
  const company = req.query.company;
  const all = getCurrentStatus().filter(s => !company || s.company === company);
  const counts = { total: all.length, online: 0, offline: 0, stream_error: 0, unknown: 0 };
  all.forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++; else counts.unknown++; });
  res.json(counts);
});

router.get('/monitoring/status', authenticate, scopeToTenant, (req, res) => {
  const company = req.query.company;
  const all = getCurrentStatus();
  res.json(company ? all.filter(s => s.company === company) : all);
});

router.get('/monitoring/status/:id', authenticate, async (req, res) => {
  try {
    const records = await CameraHealth.find({ camera_id: req.params.id }).sort({ checked_at: -1 }).limit(20).lean();
    res.json(records);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/monitoring/alerts', authenticate, (req, res) => {
  res.json(alertsBuffer.slice(0, 50));
});

router.post('/monitoring/camera/:id/toggle', authenticate, async (req, res) => {
  try {
    const cam = await Camera.findById(req.params.id).select('monitoring_enabled').lean();
    if (!cam) return res.status(404).json({ error: 'Not found' });
    const updated = await Camera.findByIdAndUpdate(
      req.params.id,
      { monitoring_enabled: !cam.monitoring_enabled },
      { new: true, select: 'monitoring_enabled' }
    );
    res.json({ monitoring_enabled: updated.monitoring_enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.addAlert = addAlert;
module.exports.getAlerts = getAlerts;
