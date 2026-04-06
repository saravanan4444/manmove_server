const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    company: { type: String, required: true, unique: true },
    brand:   { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
