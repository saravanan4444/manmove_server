var mongoose = require('mongoose');

var categorySchema = new mongoose.Schema({
  name:     { type: String, required: true },
  division: { type: String, enum: ['isp','camera','anpr','all'], default: 'all' },
  icon:     { type: String, default: 'category' },
  type:     { type: String },   // maps to inventory item type key
  company:  String,
  status:   { type: String, default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
