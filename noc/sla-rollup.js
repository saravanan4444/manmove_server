const CameraHealth = require('../models/camerahealth');
const NocSla       = require('../models/nocSla');
const NocAlert     = require('../models/nocAlert');
const Camera       = require('../models/camera');

async function runDailyRollup() {
  const now       = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const today     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const ids = await CameraHealth.distinct('camera_id', { checked_at: { $gte: yesterday, $lt: today } });

  for (const camera_id of ids) {
    const records = await CameraHealth.find({ camera_id, checked_at: { $gte: yesterday, $lt: today } }).lean();
    if (!records.length) continue;

    const total_checks  = records.length;
    const failed_checks = records.filter(r => r.status !== 'online').length;
    const uptime_pct    = ((total_checks - failed_checks) / total_checks) * 100;
    const avg_latency   = records.reduce((s, r) => s + (r.latency_ms || 0), 0) / total_checks;
    const incidents     = await NocAlert.countDocuments({ camera_id, severity: 'critical', triggered_at: { $gte: yesterday, $lt: today } });

    const cam = records[0];
    await NocSla.findOneAndUpdate(
      { camera_id, date: yesterday },
      { camera_number: cam.camera_number, ip_address: cam.ip_address, company: cam.company, total_checks, failed_checks, uptime_pct, avg_latency, incidents },
      { upsert: true }
    );
  }
}

function startSlaScheduler() {
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const msUntilMidnight = nextMidnight - now;

  setTimeout(() => {
    runDailyRollup().catch(() => {});
    setInterval(() => runDailyRollup().catch(() => {}), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

module.exports = { runDailyRollup, startSlaScheduler };
