var mongoose = require('mongoose');

var deploymentLogSchema = new mongoose.Schema({
  itemId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  itemName:      String,
  categoryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory' },
  assetTag:      String,

  eventType: { type: String, required: true,
    enum: ['received','warehouse','deployed','inspection','maintenance',
           'repair','replacement','relocated','faulty_reported','decommissioned'] },
  eventDate: { type: Date, default: Date.now },

  location: {
    zone:    String,
    area:    String,
    address: String,
    latlng:  { lat: Number, lng: Number }
  },

  // for fiber and relocated events
  fromLocation: { name: String, address: String, latlng: { lat: Number, lng: Number } },
  toLocation:   { name: String, address: String, latlng: { lat: Number, lng: Number } },
  routeLength:  Number,  // meters of cable used (fiber)
  routePath:    [{ lat: Number, lng: Number }],  // GPS waypoints

  performedBy: { empId: String, name: String },
  condition:   { type: String, enum: ['good','fair','poor','faulty'], default: 'good' },
  notes:       String,
  cost:        { type: Number, default: 0 },
  photos:      [{ label: String, url: String }],
  linkedTask:  String,

  company:  String,
  division: String,
  status:   { type: String, default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('DeploymentLog', deploymentLogSchema);
