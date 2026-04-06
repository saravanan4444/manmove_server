const mongoose = require('mongoose');
const NocSlaSchema = new mongoose.Schema({
  camera_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'cameras' },
  camera_number: String,
  ip_address:    String,
  company:       String,
  date:          { type: Date },
  total_checks:  { type: Number, default: 0 },
  failed_checks: { type: Number, default: 0 },
  uptime_pct:    { type: Number, default: 100 },
  avg_latency:   { type: Number, default: 0 },
  incidents:     { type: Number, default: 0 }
});
NocSlaSchema.index({ camera_id: 1, date: -1 });
NocSlaSchema.index({ date: -1 });
module.exports = mongoose.model('nocsla', NocSlaSchema);
