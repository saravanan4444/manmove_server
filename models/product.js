var mongoose = require('mongoose');

var DataSchema = new mongoose.Schema({
  firstName: String,
  userName: String,
  gender:String,
  address: String,
  doorno:String,
  street:String,
  city:String,
  taluk:String,
  state:String,
  nation:String,
  pin:Number,
  mobile: Number,
  email: String,
  dob: Date,
  appno: Number,
  idType: String,
  idno: String,
  addrType: String,
  addrProofNo: String,
  formurl: String,
  addrurl: String,
  idurl: String,
  packageType:String,
  packageName:String,
  latitude:String,
  longitude:String,
  status: String,
  applieddate:String,
  created_at: { type: Date },
  updated_at: { type: Date },
});
DataSchema.pre('save', function (next) {
  this.created_at = new Date();
  console.log(this.created_at)
  
  next();
});
DataSchema.pre('findOneAndUpdate', function(next) {
  this.updated_at = new Date();
  console.log(this.updated_at)
  next();
});
module.exports = mongoose.model('Data', DataSchema);