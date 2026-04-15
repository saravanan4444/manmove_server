const mongoose = require('mongoose');

// One record per status change event — used to compute real uptime %
const NvrStatusLogSchema = new mongoose.Schema({
  nvr_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'nvrs', required: true },
  nvr_number: String,
  company:    String,
  status:     { type: String, enum: ['online', 'offline', 'faulty'] },
  changed_at: { type: Date, default: Date.now },
}, { versionKey: false });

NvrStatusLogSchema.index({ nvr_id: 1, changed_at: -1 });

module.exports = mongoose.model('nvr_status_logs', NvrStatusLogSchema);
