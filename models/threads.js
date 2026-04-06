var mongoose = require('mongoose');

var ThreadsSchema = new mongoose.Schema({
  customerid:   String,
  customername: String,
  username:     String,
  mobile:       String,
  address:      String,
  issue:        String,
  priority:     String,
  issuestatus:  String,
  issuedto:     String,
  assignedby:   String,
  status:       String,
  date:         String,
  company:      String,
  division:     String,
  closingNote:  String,
  followupNote: String,
  followupDate: String,
  closedAt:     Date,
  acceptedAt:   Date,
  timeline: [{
    stage: String,
    note:  String,
    at:    Date,
    by:    String
  }],
  start:       Date,
  end:         Date,
  created_at:  { type: Date },
  updated_at:  { type: Date },
}, { strict: false });

ThreadsSchema.pre('save', function() { this.created_at = new Date(); });
ThreadsSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() });  });

module.exports = mongoose.model('Threads', ThreadsSchema);
