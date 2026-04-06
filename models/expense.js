var mongoose = require('mongoose');

var ExpenseSchema = new mongoose.Schema({
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  company: String,
  type: String,  // labour / material / diesel / equipment / misc
  amount: { type: Number, default: 0 },
  description: String,
  date: { type: Date, default: Date.now },
  added_by: String,
  created_at: Date,
});

ExpenseSchema.pre('save', function() { this.created_at = new Date(); });

module.exports = mongoose.model('expenses', ExpenseSchema);
