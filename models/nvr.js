const mongoose = require('mongoose');

const HddSlotSchema = new mongoose.Schema({
  slot:                Number,
  model:               String,
  serial:              String,
  capacity_tb:         { type: Number, default: 0 },
  used_tb:             { type: Number, default: 0 },
  temperature_c:       Number,
  health_status:       { type: String, enum: ['good','warning','failing','failed'], default: 'good' },
  power_on_hours:      Number,
  reallocated_sectors: { type: Number, default: 0 },
  last_checked:        Date,
}, { _id: false });

const NvrSchema = new mongoose.Schema({
  // ── Type discrimination ───────────────────────────────────────────────────
  nvr_type:       { type: String, enum: ['hardware', 'software'], default: 'hardware' },

  // Software NVR (VMS) fields
  vms_type:       { type: String, enum: ['milestone', 'genetec', 'hikvision_ivms', 'dahua_dss', 'blue_iris', 'shinobi', 'other'], default: null },
  health_endpoint:String,   // e.g. http://192.168.1.10:8080/api/health
  health_token:   String,   // bearer token for VMS health API

  // Hardware NVR stream access
  onvif_port:     { type: Number, default: 80 },
  rtsp_port:      { type: Number, default: 554 },
  stream_protocol:{ type: String, enum: ['rtsp', 'rtmp', 'hls', 'webrtc'], default: 'rtsp' },

  // HA / Failover pairing
  failover_nvr_id:{ type: mongoose.Schema.Types.ObjectId, ref: 'nvrs', default: null },
  is_failover:    { type: Boolean, default: false },  // true = this is the standby unit

  project_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'projects' },
  zone_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'zones' },
  company:        String,
  nvr_number:     { type: String, required: true },
  brand:          String,
  model:          String,
  channels:       { type: Number, default: 16 },
  ip_address:     String,
  mac_address:    String,
  location:       String,
  latitude:       Number,
  longitude:      Number,
  pole_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'poles' },

  // Legacy single-disk fields (kept for backward compat)
  hdd_capacity_tb:{ type: Number, default: 0 },
  hdd_used_tb:    { type: Number, default: 0 },

  // Tier 1: Multi-slot HDD SMART health
  hdd_slots:      [HddSlotSchema],

  // Tier 1: Recording management
  recording_mode:   { type: String, enum: ['continuous','motion','schedule','alarm'], default: 'continuous' },
  retention_days:   { type: Number, default: 30 },
  overwrite_policy: { type: String, enum: ['oldest_first','stop_when_full'], default: 'oldest_first' },
  daily_write_gb:   { type: Number, default: 0 },
  days_until_full:  Number,

  // Tier 1: Connectivity (auto-updated by nvr-monitor)
  status:               { type: String, default: 'not_installed' },
  last_seen:            Date,
  last_ping_ms:         Number,
  consecutive_failures: { type: Number, default: 0 },

  // Global standard additions
  uptime_pct:       { type: Number, default: null },   // rolling 30-day uptime %
  firmware_version: String,
  bandwidth_mbps:   { type: Number, default: 0 },      // last known Mbps
  ai_hdd_risk:      { type: String, enum: ['low','medium','high','critical'], default: 'low' },
  service_logs: [{
    date:       { type: Date, default: Date.now },
    engineer:   String,
    notes:      String,
    _id: false,
  }],

  installed_by:   String,
  installed_name: String,
  installed_at:   Date,
  notes:          String,
  created_at:     Date,
  updated_at:     Date,
});

NvrSchema.pre('save', function() { this.created_at = new Date(); });
NvrSchema.pre('findOneAndUpdate', function() { this.set({ updated_at: new Date() }); });
NvrSchema.index({ project_id: 1, status: 1 });
NvrSchema.index({ company: 1 });

module.exports = mongoose.model('nvrs', NvrSchema);
