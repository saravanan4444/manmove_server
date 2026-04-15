var mongoose = require('mongoose');

var ChecklistSchema = new mongoose.Schema({
  power_ok:       { type: Boolean, default: null },
  poe_ok:         { type: Boolean, default: null },
  cable_ok:       { type: Boolean, default: null },
  ping_ok:        { type: Boolean, default: null },
  rtsp_ok:        { type: Boolean, default: null },
  webui_ok:       { type: Boolean, default: null },
  nvr_channel_ok: { type: Boolean, default: null },
  physical_ok:    { type: Boolean, default: null },
  notes:          String,
}, { _id: false });

var CameraMaintenanceSchema = new mongoose.Schema({
  camera_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'cameras' },
  pole_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'poles' },
  project_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  company:      String,
  fault_type:   String,
  priority:     { type: String, enum: ['critical','high','medium','low'], default: 'medium' },
  description:  String,

  // Photos
  photo_url:        String,   // legacy
  before_photo_url: String,   // before service
  after_photo_url:  String,   // after service (required to close)

  // Field staff diagnostic checklist
  checklist: { type: ChecklistSchema, default: () => ({}) },

  // Resolution type
  resolution_type: { type: String, enum: ['replaced','repaired','cleaned','reconfigured','cable_fixed','power_fixed','other'], default: null },

  // AMC
  amc_covered:    { type: Boolean, default: false },
  amc_start:      Date,
  amc_end:        Date,
  amc_type:       { type: String, enum: ['parts_only','parts_labour','full','none'], default: 'none' },

  // SLA
  sla_hours:      { type: Number, default: 24 },   // response SLA in hours
  sla_due_at:     Date,                             // created_at + sla_hours
  sla_breached:   { type: Boolean, default: false },
  fault_count_30d:{ type: Number, default: 1 },

  // AI classification result
  ai_classification: {
    fault_type:           String,
    priority:             String,
    root_cause:           String,
    suggested_resolution: String,
    _id: false,
  },

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
CameraMaintenanceSchema.index({ camera_id: 1, created_at: -1 });

module.exports = mongoose.model('cameramaintenance', CameraMaintenanceSchema);
