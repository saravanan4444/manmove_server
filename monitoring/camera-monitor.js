const Camera       = require('../models/camera');
const CameraHealth = require('../models/camerahealth');
const { pingHost } = require('./ping');
const { checkRtsp } = require('./rtsp-check');
const alertEngine  = require('./alert-engine');

const cameraStatus  = new Map();
const alertCooldown = new Map();
const COOLDOWN_MS   = 30 * 60 * 1000;

async function checkCamera(camera, io, alertFn) {
  const { alive, latency } = await pingHost(camera.ip_address);
  const rtsp_ok = alive ? await checkRtsp(camera.ip_address) : false;
  const status  = !alive ? 'offline' : (!rtsp_ok ? 'stream_error' : 'online');

  const record = { camera_id: camera._id, ip_address: camera.ip_address, camera_number: camera.camera_number, status, latency_ms: latency, rtsp_ok, company: camera.company, checked_at: new Date() };
  await CameraHealth.create(record);

  io.emit('camera:health_update', { camera_id: camera._id, camera_number: camera.camera_number, ip_address: camera.ip_address, status, latency_ms: latency, rtsp_ok, checked_at: record.checked_at });

  const oldStatus = cameraStatus.get(String(camera._id))?.status;
  if (oldStatus && oldStatus !== status) {
    io.emit('camera:status_change', { camera_id: camera._id, camera_number: camera.camera_number, ip_address: camera.ip_address, from: oldStatus, to: status, timestamp: record.checked_at });
  }

  if (status === 'offline') {
    const last = alertCooldown.get(String(camera._id)) || 0;
    if (Date.now() - last > COOLDOWN_MS) {
      alertFn(camera);
      alertCooldown.set(String(camera._id), Date.now());
    }
  }

  cameraStatus.set(String(camera._id), { camera_id: camera._id, camera_number: camera.camera_number, ip_address: camera.ip_address, status, latency_ms: latency, rtsp_ok, checked_at: record.checked_at });

  alertEngine.processHealthUpdate(camera, status, latency, io).catch(() => {});
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function startMonitoring(io, alertFn) {
  setInterval(async () => {
    const cameras = await Camera.find({ ip_address: { $exists: true, $ne: null }, monitoring_enabled: { $ne: false } }).lean().catch(() => []);
    for (let i = 0; i < cameras.length; i += 5) {
      await Promise.all(cameras.slice(i, i + 5).map(c => checkCamera(c, io, alertFn).catch(() => {})));
      if (i + 5 < cameras.length) await sleep(1000);
    }
  }, 10000);
}

function getCurrentStatus() {
  return Array.from(cameraStatus.values());
}

module.exports = { startMonitoring, getCurrentStatus };
