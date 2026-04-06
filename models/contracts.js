var mongoose = require('mongoose');

var ContractSchema = new mongoose.Schema({
  project_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  company:              { type: String, required: true },
  division:             { type: String, enum: ['isp','camera','anpr'], required: true },
  contract_number:      { type: String, unique: true },
  contract_type:        { type: String, default: 'maintenance' }, // maintenance|warranty|support

  // Parties
  client_name:          String,
  vendor_name:          String,
  vendor_contact:       String,
  vendor_email:         String,

  // Term
  start_date:           Date,
  end_date:             Date,
  value:                { type: Number, default: 0 },
  billing_cycle:        { type: String, default: 'annual' }, // monthly|quarterly|annual
  auto_renew:           { type: Boolean, default: false },
  renewal_count:        { type: Number, default: 0 },

  // SLA
  response_sla_hours:   { type: Number, default: 4 },
  resolution_sla_hours: { type: Number, default: 24 },
  uptime_sla_percent:   { type: Number, default: 99 },

  // Status
  status:               { type: String, default: 'draft' }, // draft|active|expiring|expired|renewed
  document_url:         String,

  created_at:           Date,
  updated_at:           Date,
});

// Auto-generate contract number before save
ContractSchema.pre('save', function() {
  this.created_at = new Date();
  if (!this.contract_number) {
    var div = (this.division || 'gen').toUpperCase();
    var yr  = new Date().getFullYear();
    var rnd = Math.floor(1000 + Math.random() * 9000);
    this.contract_number = div + '-' + yr + '-' + rnd;
  }
});
ContractSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() }); });

module.exports = mongoose.model('contracts', ContractSchema);
