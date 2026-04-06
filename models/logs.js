var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var logsSchema = new Schema({
    date: { type: Date, default: Date.now },
    Username: String,
    Desc: String,
    Mac: String,
    company: String,
    status: { type: String, default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('logs', logsSchema);
