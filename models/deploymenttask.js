var mongoose = require('mongoose');

var deploymentTaskSchema = new mongoose.Schema({
  taskType:     { type: String, required: true },
  division:     String,
  company:      String,
  zone:         String,
  assignedTo:   String,
  assignedName: String,
  createdBy:    String,
  dueDate:      Date,
  notes:        String,
  taskStatus:   { type: String, default: 'pending', enum: ['pending','assigned','accepted','inprogress','done'] },
  timeline: [{
    stage: String,
    note:  String,
    at:    Date,
    by:    String
  }]
}, { timestamps: true });

module.exports = mongoose.model('DeploymentTask', deploymentTaskSchema);
