var mongoose = require('mongoose');

var subcategorySchema = new mongoose.Schema({
  name:       { type: String, required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  division:   String,
  fields: [{
    key:      String,
    label:    String,
    type:     { type: String, enum: ['text','number','select','date'], default: 'text' },
    unit:     String,
    options:  [mongoose.Schema.Types.Mixed],
    required: { type: Boolean, default: false }
  }],
  company:  String,
  status:   { type: String, default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Subcategory', subcategorySchema);
