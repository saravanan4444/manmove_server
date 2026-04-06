const mongoose = require('mongoose');

const CoreAllocationSchema = new mongoose.Schema({
  route_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'fiberroutes', required: true },
  core_number:     { type: Number, required: true },
  allocated_to:    { type: String, default: 'spare' },  // company name or 'spare'/'maintenance'
  allocation_type: { type: String, enum: ['own_use','lease','spare','maintenance'], default: 'spare' },
  circuit_id:      String,
  bandwidth_gbps:  Number,
  monthly_rent:    Number,
  lease_start:     Date,
  lease_end:       Date,
  notes:           String,
  status:          { type: String, enum: ['active','suspended','expired'], default: 'active' },
  owner_company:   { type: String, required: true },  // always the infra owner (Serans)
}, { timestamps: true });

CoreAllocationSchema.index({ route_id: 1, core_number: 1 }, { unique: true });
CoreAllocationSchema.index({ allocated_to: 1 });

module.exports = mongoose.model('coreallocation', CoreAllocationSchema);
