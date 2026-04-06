var mongoose = require('mongoose');

var companySchema = new mongoose.Schema({
    name:    { type: String, required: true },
    email:   String,
    mobile:  String,
    address: String,
    status:  { type: String, default: 'active' },
    divisions: {
        isp:    { type: Boolean, default: true },
        camera: { type: Boolean, default: false },
        anpr:   { type: Boolean, default: false }
    }
}, { timestamps: true });

companySchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('companies', companySchema);
