var mongoose = require('mongoose');

var companySchema = new mongoose.Schema({
    // ── Identity ──────────────────────────────────────────────────────────────
    name:         { type: String, required: true },
    legal_name:   String,   // Official registered name
    reg_number:   String,   // Company registration / CIN number
    gst_number:   String,
    pan_number:   String,

    // ── Contact ───────────────────────────────────────────────────────────────
    email:        String,
    mobile:       String,
    alt_mobile:   String,
    website:      String,

    // ── Address ───────────────────────────────────────────────────────────────
    address:      String,
    city:         String,
    district:     String,
    state:        String,
    pincode:      String,
    country:      { type: String, default: 'India' },

    // ── Contract / Business ───────────────────────────────────────────────────
    contract_start: Date,
    contract_end:   Date,
    account_manager: String,  // ManMove account manager name
    notes:          String,

    // ── Divisions ─────────────────────────────────────────────────────────────
    divisions: {
        isp:          { type: Boolean, default: true  },
        camera:       { type: Boolean, default: false },
        anpr:         { type: Boolean, default: false },
        surveillance: { type: Boolean, default: false },
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status:  { type: String, default: 'active', enum: ['active','inactive','suspended','trial'] },
    type:    { type: String, default: 'isp',    enum: ['isp','anpr','camera','surveillance','hybrid'] },
    logo_url: String,

}, { timestamps: true });

companySchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('companies', companySchema);
