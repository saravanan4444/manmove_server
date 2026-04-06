const mongoose = require('mongoose');

const sessionLogSchema = new mongoose.Schema({
    userId:      { type: String, required: true },
    userEmail:   String,
    userName:    String,
    userType:    { type: String, enum: ['admin', 'field'], default: 'admin' },
    role:        String,
    company:     String,

    // Network
    ip:          String,
    userAgent:   String,

    // Device info parsed from User-Agent
    device:      String,   // e.g. "Mobile", "Desktop", "Tablet"
    os:          String,   // e.g. "Android 13", "Windows 11", "iOS 17"
    browser:     String,   // e.g. "Chrome 120", "Safari 17"

    // Client-supplied (from app/frontend)
    imei:        String,   // mobile app can send this
    macAddress:  String,   // desktop app can send this
    deviceId:    String,   // unique device fingerprint from client
    appVersion:  String,

    // Location (from IP geolocation or client-supplied)
    city:        String,
    region:      String,
    country:     String,
    latitude:    Number,
    longitude:   Number,

    // Session
    status:      { type: String, enum: ['success', 'failed', 'blocked'], default: 'success' },
    failReason:  String,   // wrong_password / user_not_found / blocked
    logoutAt:    Date,
    sessionId:   String,   // JWT jti if used

    loginAt:     { type: Date, default: Date.now },
}, { versionKey: false });

sessionLogSchema.index({ userId: 1, loginAt: -1 });
sessionLogSchema.index({ company: 1, loginAt: -1 });
sessionLogSchema.index({ ip: 1 });
sessionLogSchema.index({ status: 1 });

module.exports = mongoose.model('sessionlogs', sessionLogSchema);
