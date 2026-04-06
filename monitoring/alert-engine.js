const NocAlert     = require('../models/nocAlert');
const CameraHealth = require('../models/camerahealth');

const strikeMap = new Map();

async function processHealthUpdate(camera, status, latency_ms, io) {
  const id = String(camera._id);
  const { camera_number, ip_address, company } = camera;

  if (status === 'offline' || status === 'stream_error') {
    const strikes = (strikeMap.get(id) || 0) + 1;
    strikeMap.set(id, strikes);

    if (strikes >= 3) {
      const existing = await NocAlert.findOne({ camera_id: camera._id, severity: 'critical', resolved_at: null });
      if (!existing) {
        const alert = await NocAlert.create({ severity: 'critical', camera_id: camera._id, camera_number, ip_address, company, description: `Camera ${camera_number} is ${status} (${strikes} consecutive failures)` });
        io.emit('noc:alert', alert);
        strikeMap.set(id, 0);
      }
    }
  } else if (status === 'online') {
    const hadStrikes = (strikeMap.get(id) || 0) > 0;
    strikeMap.set(id, 0);

    const unresolved = await NocAlert.findOne({ camera_id: camera._id, severity: { $in: ['critical', 'warning'] }, resolved_at: null });
    if (unresolved) {
      const resolved_at = new Date();
      await NocAlert.updateOne({ _id: unresolved._id }, { resolved_at });
      io.emit('noc:alert_resolved', { camera_id: camera._id, camera_number, resolved_at });

      if (unresolved.severity === 'critical' || hadStrikes) {
        await NocAlert.create({ severity: 'info', camera_id: camera._id, camera_number, ip_address, company, description: `Camera ${camera_number} recovered` });
      }
    }
  }

  if (latency_ms > 500) {
    const existing = await NocAlert.findOne({ camera_id: camera._id, severity: 'warning', resolved_at: null });
    if (!existing) {
      await NocAlert.create({ severity: 'warning', camera_id: camera._id, camera_number, ip_address, company, description: `Camera ${camera_number} high latency: ${latency_ms}ms` });
    }
  } else if (latency_ms > 200 && latency_ms <= 500) {
    io.emit('noc:latency_warning', { camera_id: camera._id, latency_ms });
  }
}

function getStrikes(cameraId) {
  return strikeMap.get(String(cameraId)) || 0;
}

function getAllStrikes() {
  return Array.from(strikeMap.entries())
    .filter(([, v]) => v > 0)
    .map(([camera_id, strikes]) => ({ camera_id, strikes }));
}

module.exports = { processHealthUpdate, getStrikes, getAllStrikes };
