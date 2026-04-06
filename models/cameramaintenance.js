var mongoose = require('mongoose');

var CameraMaintenanceSchema = new mongoose.Schema({
  camera_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'cameras' },
  pole_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'poles' },
  project_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  company:      String,
  fault_type:   String,
  priority:     { type: String, enum: ['critical','high','medium','low'], default: 'medium' },
  description:  String,
  photo_url:    String,
  reported_by:  String,
  assigned_to:  String,
  assigned_name: String,
  resolved_by:  String,
  status: { type: String, default: 'open' },
  resolution:   String,
  resolved_at:  Date,
  sla_breached: { type: Boolean, default: false },
  created_at:   Date,
  updated_at:   Date,
});

CameraMaintenanceSchema.pre('save', function() { this.created_at = new Date(); });
CameraMaintenanceSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() }); });

module.exports = mongoose.model('cameramaintenance', CameraMaintenanceSchema);
