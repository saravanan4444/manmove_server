var mongoose = require('mongoose');

var CameraCustomerSchema = new mongoose.Schema({
  // Basic Info
  firstname: String,
  lastname: String,
  mobile: String,
  email: String,
  address: String,
  landmark: String,
  company: String,
  zone: String,
  area: String,
  division: { type: String, default: 'camera' },
  priority: String,
  leadsource: String,
  stage: String,   // lead / survey / postsurvey / installation / customer
  status: String,

  // Camera Specific - Lead stage
  camera_type: String,       // dome / bullet / PTZ / fisheye
  camera_count: Number,
  location_type: String,     // indoor / outdoor / both
  power_source: String,      // electric / solar / UPS
  dvr_nvr_type: String,      // DVR / NVR / Cloud

  // Survey stage
  cable_route: String,
  power_available: String,
  network_available: String,
  mounting_surface: String,
  survey_notes: String,

  // Installation stage
  cable_type: String,
  cable_length: String,
  dvr_placement: String,
  install_notes: String,

  // Customer stage
  camera_serials: [String],
  dvr_serial: String,
  ip_addresses: [String],
  recording_schedule: String,
  custId: Number,

  created_at: { type: Date },
  updated_at: { type: Date },
});

CameraCustomerSchema.pre('save', function() {
  this.created_at = new Date();
  });
CameraCustomerSchema.pre('findOneAndUpdate', function() {
  this.updated_at = new Date();
  });

module.exports = mongoose.model('cameracustomers', CameraCustomerSchema);
