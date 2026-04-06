var mongoose = require('mongoose');

var SystemLogSchema = new mongoose.Schema({
  action:      String,   // POLE_STAGE_UPDATE / CAMERA_FAULT / LOGIN / etc.
  entity:      String,   // pole / camera / project / material / user / auth
  entity_id:   String,
  description: String,
  user_name:   String,
  user_id:     String,
  company:     String,
  ip:          String,
  status:      { type: String, default: 'success' }, // success / error / blocked
  error_msg:   String,
  created_at:  { type: Date, default: Date.now }
});

SystemLogSchema.index({ company: 1, created_at: -1 });
SystemLogSchema.index({ action: 1 });
SystemLogSchema.index({ entity: 1, entity_id: 1 });

module.exports = mongoose.model('systemlogs', SystemLogSchema);
