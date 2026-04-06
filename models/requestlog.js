const mongoose = require('mongoose');

const RequestLogSchema = new mongoose.Schema({
    method:       String,
    url:          String,
    status:       Number,
    responseTime: Number,
    ip:           String,
    userId:       String,
    userAgent:    String,
    timestamp:    { type: Date, default: Date.now }
});

// Auto-delete after 180 days
RequestLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 15552000 });
RequestLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('requestlogs', RequestLogSchema);
