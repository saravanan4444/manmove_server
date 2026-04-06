var mongoose = require('mongoose');

var UserListSchema = new mongoose.Schema({
  empId:        String,
  mobile:       Number,
  password:     String,
  name:         String,
  role:         String,
  email:        String,
  company:      String,
  imgUrl:       String,
  lastlogin:    String,
  lastlogout:   String,
  activities:   Array,
  attendance:   Array,
  signinstatus: String,
  status:       String,
  zone:         String,
  area:         [String],
  division:     [String],
  // GPS — updated by Ionic app on signin/location update
  lat:          Number,
  lng:          Number,
  lastlat:      Number,
  lastlng:      Number,
  lastLocationAt: Date,
  created_at:   { type: Date },
  updated_at:   { type: Date },
}, { strict: false });
UserListSchema.pre('save', function() {
  this.created_at = new Date();

  });
UserListSchema.pre('findOneAndUpdate', function() {
  this.updated_at = new Date();
  });
UserListSchema.index({ empId: 1 }, { unique: true });
UserListSchema.index({ email: 1, company: 1 }, { unique: true, sparse: true });
UserListSchema.index({ mobile: 1, company: 1 }, { sparse: true });
UserListSchema.index({ company: 1, status: 1 });
UserListSchema.index({ zone: 1 });

module.exports = mongoose.model('UserList', UserListSchema);