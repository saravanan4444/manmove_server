var mongoose = require('mongoose');

var PackageSchema = new mongoose.Schema({
  packageName: String,
  packageType: String,
  status: String,
  created_at: { type: Date },
  updated_at: { type: Date },
});
PackageSchema.pre('save', function() {
  this.created_at = new Date();
  
  });
PackageSchema.pre('findOneAndUpdate', function() {
  this.updated_at = new Date();
  
});
module.exports = mongoose.model('Package', PackageSchema);