var mongoose = require('mongoose');

var AdminuserSchema = new mongoose.Schema({
    name: String,
    email: String,
    mobile: Number,
    password: String,
    role: String,
    pages: [],
    status: String,
    created_at: { type: Date },
    updated_at: { type: Date },
});
AdminuserSchema.pre('save', function (next) {
    this.created_at = new Date();
    console.log(this.created_at)

    next();
});
AdminuserSchema.pre('findOneAndUpdate', function (next) {
    this.updated_at = new Date();
    console.log(this.updated_at)
    next();
});
module.exports = mongoose.model('Adminuser', AdminuserSchema);