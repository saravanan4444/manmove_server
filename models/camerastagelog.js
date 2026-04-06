var mongoose = require('mongoose');

var CameraStageLogSchema = new mongoose.Schema({
  camera_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'cameras' },
  pole_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'poles' },
  project_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  company:     String,
  stage:       String,
  remarks:     String,
  photo_url:   String,
  latitude:    Number,
  longitude:   Number,
  user_id:     String,
  user_name:   String,
  date:        { type: Date, default: Date.now },
  created_at:  Date,
});

CameraStageLogSchema.pre('save', function() { this.created_at = new Date(); });

module.exports = mongoose.model('camerastagelog', CameraStageLogSchema);
