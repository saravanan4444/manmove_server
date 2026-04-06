var mongoose = require('mongoose');
var MONGO_URL = 'mongodb://127.0.0.1/my_database';

var categorySchema = new mongoose.Schema({
  name: String, division: String, icon: String, type: String, status: String
}, { timestamps: true });
var Category = mongoose.model('Category', categorySchema);

var types = [
  { name: 'Switch',         division: 'isp',    icon: 'router',                   type: 'switch' },
  { name: 'OLT',            division: 'isp',    icon: 'dns',                      type: 'olt' },
  { name: 'SFP Module',     division: 'isp',    icon: 'memory',                   type: 'sfp' },
  { name: 'Big J-Closure',  division: 'isp',    icon: 'device_hub',               type: 'bigjclosure' },
  { name: 'Small J-Closure',division: 'isp',    icon: 'settings_input_component', type: 'smalljclosure' },
  { name: 'Optical Wire',   division: 'isp',    icon: 'cable',                    type: 'opticwire' },
  { name: 'Stay Wire',      division: 'isp',    icon: 'linear_scale',             type: 'staywire' },
  { name: 'Splitter',       division: 'isp',    icon: 'call_split',               type: 'splitter' },
  { name: 'ONT/ONU',        division: 'isp',    icon: 'router',                   type: 'ont' },
  { name: 'Pole',           division: 'isp',    icon: 'vertical_align_top',       type: 'pole' },
  { name: 'IP Camera',      division: 'camera', icon: 'videocam',                 type: 'ipcamera' },
  { name: 'DVR/NVR',        division: 'camera', icon: 'video_settings',           type: 'dvrnvr' },
  { name: 'Camera Cable',   division: 'camera', icon: 'cable',                    type: 'cameracable' },
  { name: 'ANPR Camera',    division: 'anpr',   icon: 'camera_outdoor',           type: 'anprcamera' },
  { name: 'UPS',            division: 'anpr',   icon: 'battery_charging_full',    type: 'ups' },
  { name: 'Controller',     division: 'anpr',   icon: 'developer_board',          type: 'controller' },
];

mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true }, async function(err) {
  if (err) { console.error(err); process.exit(1); }
  var inserted = 0;
  for (var t of types) {
    var exists = await Category.findOne({ type: t.type });
    if (!exists) {
      await Category.create({ ...t, status: 'active' });
      inserted++;
      console.log('Added:', t.name);
    } else {
      // update icon and type if missing
      await Category.updateOne({ _id: exists._id }, { $set: { icon: t.icon, type: t.type, division: t.division } });
    }
  }
  console.log('Done. Inserted:', inserted);
  mongoose.disconnect();
});
