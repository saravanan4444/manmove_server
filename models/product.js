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
  company: String,
  zone: String,
  area: String,
  applieddate:String,
  created_at: { type: Date },
  updated_at: { type: Date },
});
DataSchema.pre('save', function() {
  this.created_at = new Date();
});
DataSchema.pre('findOneAndUpdate', function() {
  this.updated_at = new Date();
});
DataSchema.index({ company: 1, status: 1 });
module.exports = mongoose.model('Data', DataSchema);