var mongoose = require('mongoose');

var ProjectSchema = new mongoose.Schema({
  name: String,
  company: { type: String, required: true },
  division: { type: String, default: 'anpr' },
  client_name: String,
  tender_number: String,
  state: String,
  district: String,
  start_date: Date,
  end_date: Date,
  go_live_date: Date,
  total_poles: { type: Number, default: 0 },
  zone_count: { type: Number, default: 0 },
  contract_value: { type: Number, default: 0 },
  budget: { type: Number, default: 0 },
  billed_amount: { type: Number, default: 0 },
  status: { type: String, default: 'active' },
  contract_status: { type: String, default: 'none' },
  description: String,
  survey_pdf: String,
  created_at: Date,
  updated_at: Date,
});

ProjectSchema.pre('save', function() { this.created_at = new Date(); });
ProjectSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() }); });

ProjectSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('projects', ProjectSchema);
