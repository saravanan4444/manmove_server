var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var roleSchema = new Schema({
    name: { type: String, required: true },
    company: String,
    pages: [String],
    division: { type: [String], default: [] },
    actions: {
        create: { type: Boolean, default: true },
        update: { type: Boolean, default: true },
        delete: { type: Boolean, default: false },
        export: { type: Boolean, default: false },
        import: { type: Boolean, default: false },
        verify: { type: Boolean, default: false },
        assign: { type: Boolean, default: false }
    },
    hiddenFields: { type: [String], default: [] },
    status: { type: String, default: 'active' }
}, { timestamps: true });

roleSchema.index({ company: 1, name: 1 }, { unique: true });
roleSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('roles', roleSchema);
