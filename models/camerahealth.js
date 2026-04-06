const mongoose = require('mongoose');
const CameraHealthSchema = new mongoose.Schema({
  camera_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'cameras' },
  ip_address:  String,
  camera_number: String,
  status:      { type: String, default: 'unknown' }, // online/offline/stream_error/unknown
  latency_ms:  Number,
  rtsp_ok:     Boolean,
  company:     String,
  checked_at:  { type: Date, default: Date.now }
});
CameraHealthSchema.index({ checked_at: 1 }, { expireAfterSeconds: 2592000 }); // 30 days TTL
CameraHealthSchema.index({ camera_id: 1, checked_at: -1 });
CameraHealthSchema.index({ status: 1 });
module.exports = mongoose.model('camerahealth', CameraHealthSchema);
