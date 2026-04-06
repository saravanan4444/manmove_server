var mongoose = require('mongoose');

var AdminuserSchema = new mongoose.Schema({
    name: String,
    email: String,
    mobile: Number,
    password: String,
    role: String,
    company:String,
    division: { type: [String], default: ['isp'] },
    pages: [],
    tokenVersion: { type: Number, default: 0 },  // increment to invalidate all active sessions
    status: String,
    created_at: { type: Date },
    updated_at: { type: Date },
});
AdminuserSchema.pre('save', function() {
    this.created_at = new Date();
});
AdminuserSchema.pre('findOneAndUpdate', function() {
    this.set({ updated_at: new Date() });
});
AdminuserSchema.index({ email: 1, company: 1 }, { unique: true });
AdminuserSchema.index({ mobile: 1, company: 1 }, { sparse: true });

module.exports = mongoose.model('Adminuser', AdminuserSchema);