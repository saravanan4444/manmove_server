var mongoose = require('mongoose');

var AssetSchema = new mongoose.Schema({
  company:              { type: String, required: true },
  division:             { type: String, enum: ['isp','camera','anpr'] },
  project_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },

  asset_type:           String,  // camera|pole|olt|fiber|nvr|splitter
  asset_ref:            mongoose.Schema.Types.ObjectId, // points to cameras/poles/inventory
  asset_number:         String,  // e.g. "CAM-101-1"
  serial_number:        String,
  make:                 String,
  model:                String,

  install_date:         Date,
  warranty_expiry:      Date,
  under_contract:       { type: Boolean, default: false },
  contract_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'contracts' },

  last_service_date:    Date,
  next_service_date:    Date,

  status:               { type: String, default: 'active' }, // active|faulty|replaced|decommissioned
  created_at:           Date,
  updated_at:           Date,
});

AssetSchema.pre('save', function() { this.created_at = new Date();  });
AssetSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() });  });

module.exports = mongoose.model('assets', AssetSchema);
