var mongoose = require('mongoose');

var bomSchema = new mongoose.Schema({
  project_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'projects', required: true },
  item_name:     { type: String, required: true },
  category:      String,   // ANPR Camera, Pole, UPS, Cable, etc.
  unit:          { type: String, default: 'pcs' }, // pcs, m, kg
  qty_required:  { type: Number, default: 0 },
  qty_procured:  { type: Number, default: 0 },
  qty_deployed:  { type: Number, default: 0 },
  unit_cost:     { type: Number, default: 0 },
  inventory_subcategory: String,
  vendor_name:           String,
  expected_delivery_date: Date,
  remarks:       String,
  status:        { type: String, default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('BOM', bomSchema);
