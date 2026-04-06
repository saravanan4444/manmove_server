var mongoose = require('mongoose');

var WorkOrderSchema = new mongoose.Schema({
  contract_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'contracts' },
  project_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  company:              { type: String, required: true },
  division:             { type: String, enum: ['isp','camera','anpr'] },

  // Asset
  asset_type:           String,  // camera|pole|olt|fiber|nvr
  asset_id:             mongoose.Schema.Types.ObjectId,
  asset_ref:            String,  // e.g. "CAM-101-1"

  // Ticket
  ticket_number:        { type: String, unique: true },
  priority:             { type: String, default: 'medium' }, // critical|high|medium|low
  issue_type:           String,  // hardware|software|connectivity|power
  description:          String,

  // Assignment
  assigned_to:          String,
  assigned_name:        String,
  scheduled_date:       Date,

  // Resolution
  visit_date:           Date,
  action_taken:         String,
  parts_replaced:       [String],
  visit_cost:           { type: Number, default: 0 },
  photos:               [String],

  // SLA tracking
  reported_at:          Date,
  responded_at:         Date,
  resolved_at:          Date,
  sla_breached:         { type: Boolean, default: false },

  status:               { type: String, default: 'open' }, // open|assigned|in_progress|resolved|closed
  created_at:           Date,
  updated_at:           Date,
});

WorkOrderSchema.pre('save', function() {
  this.created_at = new Date();
  this.reported_at = this.reported_at || new Date();
  if (!this.ticket_number) {
    var yr  = new Date().getFullYear();
    var rnd = Math.floor(1000 + Math.random() * 9000);
    this.ticket_number = 'WO-' + yr + '-' + rnd;
  }
});
WorkOrderSchema.pre('findOneAndUpdate', function() {
  var upd = this.getUpdate();
  this.set({ updated_at: new Date() });
  if (upd && upd.resolved_at && upd.reported_at) {
    var hrs = (new Date(upd.resolved_at) - new Date(upd.reported_at)) / 3600000;
    this.set({ sla_breached: hrs > 24 });
  }
});

module.exports = mongoose.model('workorders', WorkOrderSchema);
