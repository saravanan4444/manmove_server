var mongoose = require('mongoose');

var MaterialSchema = new mongoose.Schema({
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  company: String,
  name: String,
  unit: String,  // nos / meters / kg
  qty_ordered: { type: Number, default: 0 },
  qty_received: { type: Number, default: 0 },
  qty_used: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  vendor: String,
  created_at: Date,
  updated_at: Date,
});

MaterialSchema.pre('save', function() { this.created_at = new Date(); });
MaterialSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() }); });

module.exports = mongoose.model('materials', MaterialSchema);
