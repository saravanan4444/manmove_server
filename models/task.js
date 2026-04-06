var mongoose = require('mongoose');

var TaskSchema = new mongoose.Schema({
  eventTitle: String,
  description: String,
  venue: String,
  date: String,
  time: String,
  status: String,
  videoUrl:String,
  created_at: { type: Date },
  updated_at: { type: Date },
});
TaskSchema.pre('save', function() {
  this.created_at = new Date();
  
  });
TaskSchema.pre('findOneAndUpdate', function() {
  this.updated_at = new Date();
  
});
module.exports = mongoose.model('Task', TaskSchema);