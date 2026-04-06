var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var zoneSchema = new Schema({
  name: { type: String, required: true },
  areas: [String],
  company: String,
  division: { type: String, default: 'both' },
  status: { type: String, default: 'active' }
}, { timestamps: true });

zoneSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('zones', zoneSchema);
