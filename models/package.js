var mongoose = require('mongoose');

var PackageSchema = new mongoose.Schema({
  packageName: String,
  packageType: String,
  status: String,
  created_at: { type: Date },
  updated_at: { type: Date },
});
PackageSchema.pre('save', function (next) {
  this.created_at = new Date();
  console.log(this.created_at)
  
  next();
});
PackageSchema.pre('findOneAndUpdate', function(next) {
  this.updated_at = new Date();
  console.log(this.updated_at)
  next();
});
module.exports = mongoose.model('Package', PackageSchema);