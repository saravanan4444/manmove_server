var mongoose = require('mongoose');

var inventorySchema = new mongoose.Schema({
  type:         String,
  categoryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subcategoryId:{ type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory' },
  name:         String,
  assetTag:     String,
  serialNumber: String,
  barcode:      String,
  company:      String,
  division:     { type: String, enum: ['isp','camera','anpr','surveillance','both'], default: 'isp' },
  zone:         String,
  area:         String,
  assignedTo:   String,   // empId
  assignedName: String,
  installedBy:  String,
  installDate:  Date,
  lifecycleStatus: { type: String, default: 'warehouse',
    enum: ['procurement','warehouse','deployed','in_service','maintenance','faulty','retired'] },
  condition:    { type: String, default: 'good', enum: ['good','fair','poor','faulty'] },
  purchaseDate:    Date,
  warrantyExpiry:  Date,
  vendor:          String,
  purchaseCost:    Number,
  latlng:          { lat: Number, lng: Number },
  specs:           { type: mongoose.Schema.Types.Mixed, default: {} },
  imageUrl:        String,
  status:          { type: String, default: 'active' }
}, { timestamps: true });

inventorySchema.index({ company: 1, status: 1 });
inventorySchema.index({ company: 1, division: 1, lifecycleStatus: 1 });
inventorySchema.index({ serialNumber: 1 });
inventorySchema.index({ assetTag: 1 });

module.exports = mongoose.model('Inventory', inventorySchema);
