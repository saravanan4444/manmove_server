const mongoose = require('mongoose');
const StationMetaSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  company:     String,
  project_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  lat:         Number,
  lng:         Number,
  nvr_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'nvrs', default: null },
  address:     String,
  notes:       String,
  updated_at:  Date,
});
StationMetaSchema.index({ name: 1, company: 1 }, { unique: true, sparse: true });
StationMetaSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() }); });
module.exports = mongoose.model('stationmeta', StationMetaSchema);
