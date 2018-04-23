var mongoose = require('mongoose');

var UserListSchema = new mongoose.Schema({
  email: String,
  mobile: Number,
  password:String,
  deviceId:String,
  status: String,
  created_at: { type: Date },
  updated_at: { type: Date },
});
UserListSchema.pre('save', function (next) {
  this.created_at = new Date();
  console.log(this.created_at)
  
  next();
});
UserListSchema.pre('findOneAndUpdate', function(next) {
  this.updated_at = new Date();
  console.log(this.updated_at)
  next();
});
module.exports = mongoose.model('UserList', UserListSchema);