var mongoose = require('mongoose');

var PoleSchema = new mongoose.Schema({
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  zone_id: { type: mongoose.Schema.Types.ObjectId, ref: 'zones' },
  company: String,
  pole_number: String,
  latitude: Number,
  longitude: Number,
  address: String,
  road_name: String,
  chainage: String,
  police_station: String,
  junction: String,
  pole_type: String,
  pole_height_m: Number,
  foundation_type: String,
  power_source: String,
  earthing_done: { type: Boolean, default: false },
  cctv_count: { type: Number, default: 0 },
  anpr_count:  { type: Number, default: 0 },
  assigned_to: String,
  assigned_name: String,
  current_stage: { type: String, default: 'not_started' },
  status: { type: String, default: 'not_started' },
  civil_cost:  { type: Number, default: 5000 },
  pole_cost:   { type: Number, default: 18000 },
  cable_cost:  { type: Number, default: 3000 },
  labour_cost: { type: Number, default: 2000 },
  created_at: Date,
  updated_at: Date,
});

PoleSchema.pre('save', function() { this.created_at = new Date(); });
PoleSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() }); });

PoleSchema.index({ project_id: 1, status: 1 });
PoleSchema.index({ project_id: 1, zone_id: 1 });
PoleSchema.index({ pole_number: 1, project_id: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('poles', PoleSchema);
