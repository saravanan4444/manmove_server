const mongoose = require('mongoose');
const NocAlertSchema = new mongoose.Schema({
  severity:      { type: String, enum: ['critical','warning','info'], default: 'info' },
  camera_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'cameras' },
  camera_number: String,
  ip_address:    String,
  company:       String,
  description:   String,
  source:        { type: String, default: 'manmove' },
  acknowledged:  { type: Boolean, default: false },
  ack_by:        String,
  ack_at:        Date,
  resolved_at:   Date,
  triggered_at:  { type: Date, default: Date.now }
});
NocAlertSchema.index({ triggered_at: -1 });
NocAlertSchema.index({ camera_id: 1, resolved_at: 1 });
NocAlertSchema.index({ severity: 1, acknowledged: 1 });
NocAlertSchema.index({ company: 1, resolved_at: 1 });
module.exports = mongoose.model('nocalerts', NocAlertSchema);
