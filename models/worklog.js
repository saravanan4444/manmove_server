var mongoose = require('mongoose');

var WorklogSchema = new mongoose.Schema({
  pole_id: { type: mongoose.Schema.Types.ObjectId, ref: 'poles' },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  zone_id: { type: mongoose.Schema.Types.ObjectId, ref: 'zones' },
  company: String,
  stage: String,  // digging / foundation / pole_installed / cabling_done / camera_installed / testing / completed
  remarks: String,
  photo_url: String,
  latitude: Number,
  longitude: Number,
  user_id: String,
  user_name: String,
  date: { type: Date, default: Date.now },
  created_at: Date,
});

WorklogSchema.pre('save', function() { this.created_at = new Date(); });

WorklogSchema.index({ pole_id: 1, created_at: -1 });
WorklogSchema.index({ project_id: 1 });

module.exports = mongoose.model('worklogs', WorklogSchema);
