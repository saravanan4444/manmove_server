var mongoose = require('mongoose');

var CameraSchema = new mongoose.Schema({
  pole_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'poles' },
  project_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  zone_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'zones' },
  company:      String,
  camera_number: String,          // e.g. CAM-101-1
  camera_type:  String,           // anpr / evidence / normal
  brand:        String,
  model:        String,
  serial_number: String,
  ip_address:   String,
  rtsp_url:    String,
  resolution:  String,           // 2MP / 4MP / 8MP / 12MP
  lens_mm:     String,           // focal length e.g. "6mm"
  direction_angle: Number,       // degrees 0-360
  lane_direction: String,        // inbound / outbound / both
  lpr_enabled: { type: Boolean, default: false },
  channel_number: Number,
  assigned_to:  String,           // empId
  assigned_name: String,
  current_stage: { type: String, default: 'not_started' },
  // not_started / unboxed / cable_pulled / mounted / connected / ip_configured / testing / completed
  status: { type: String, default: 'not_started' },
  // not_started / in_progress / completed / faulty
  nvr_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'nvrs' },
  nvr_channel: Number,
  monitoring_enabled: { type: Boolean, default: true },
  rtsp_url:    String,
  created_at: Date,
  updated_at: Date,
});

CameraSchema.pre('save', function() { this.created_at = new Date(); });
CameraSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() }); });

CameraSchema.index({ project_id: 1, status: 1 });
CameraSchema.index({ pole_id: 1 });
CameraSchema.index({ camera_number: 1, project_id: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('cameras', CameraSchema);
