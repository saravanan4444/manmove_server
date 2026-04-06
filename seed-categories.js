// Run once: node seed-categories.js
require('dotenv').config();
var mongoose = require('mongoose');
var Category = require('./models/category');
var Subcategory = require('./models/subcategory');

var db = require('./config/db');

var SEED = [
  // ISP
  { cat: { name: 'ISP Equipment', division: 'isp', icon: 'wifi' }, subs: [
    { name: 'Switch',         fields: [{ key:'model', label:'Model Number', type:'text' }, { key:'ports', label:'Ports', type:'select', options:[8,10,12,16,24,32,48,60] }, { key:'sfpports', label:'SFP Ports', type:'number', unit:'ports' }, { key:'macaddress', label:'MAC Address', type:'text' }] },
    { name: 'OLT',            fields: [{ key:'model', label:'Model Number', type:'text' }, { key:'ports', label:'PON Ports', type:'select', options:[4,8,16,32] }, { key:'ethernet', label:'Ethernet Ports', type:'number', unit:'ports' }, { key:'macaddress', label:'MAC Address', type:'text' }] },
    { name: 'SFP Module',     fields: [{ key:'model', label:'Model Number', type:'text' }, { key:'mode', label:'Mode', type:'select', options:['Single Mode','Multi Mode'] }, { key:'reach', label:'Reach', type:'select', options:['1km','10km','20km','40km','80km'] }] },
    { name: 'Big J-Closure',  fields: [{ key:'brand', label:'Brand', type:'text' }, { key:'boxid', label:'Box ID', type:'text' }, { key:'capacity', label:'Capacity', type:'number', unit:'cores' }] },
    { name: 'Small J-Closure',fields: [{ key:'brand', label:'Brand', type:'text' }, { key:'boxid', label:'Box ID', type:'text' }, { key:'dateofpurchase', label:'Date of Purchase', type:'date' }] },
    { name: 'Optical Wire',   fields: [{ key:'brand', label:'Brand', type:'text' }, { key:'cableid', label:'Cable ID', type:'text' }, { key:'core', label:'Core Count', type:'select', options:[4,6,8,12,24,48,96] }, { key:'coredia', label:'Core Diameter', type:'select', options:['0.25mm','0.5mm','0.9mm'] }, { key:'startmeter', label:'Start Meter', type:'number', unit:'m' }, { key:'endmeter', label:'End Meter', type:'number', unit:'m' }, { key:'weight', label:'Weight', type:'number', unit:'kg' }] },
    { name: 'Stay Wire',      fields: [{ key:'brand', label:'Brand', type:'text' }, { key:'drumid', label:'Drum ID', type:'text' }, { key:'coredia', label:'Diameter', type:'select', options:['3mm','4mm','6mm','8mm'] }, { key:'startmeter', label:'Start Meter', type:'number', unit:'m' }, { key:'endmeter', label:'End Meter', type:'number', unit:'m' }] },
    { name: 'Splitter',       fields: [{ key:'brand', label:'Brand', type:'text' }, { key:'splitterid', label:'Splitter ID', type:'text' }, { key:'splittervalue', label:'Splitter Value', type:'select', options:['1:2','1:4','1:8','1:16','1:32'] }] },
    { name: 'ONT/ONU',        fields: [{ key:'model', label:'Model', type:'text' }, { key:'macaddress', label:'MAC Address', type:'text' }, { key:'customerid', label:'Customer ID', type:'text' }] },
    { name: 'Pole',           fields: [{ key:'poleid', label:'Pole ID', type:'text' }, { key:'height', label:'Height', type:'number', unit:'m' }, { key:'material', label:'Material', type:'select', options:['Wood','Concrete','Steel','GI'] }, { key:'load', label:'Load Capacity', type:'number', unit:'kg' }] },
  ]},
  // Camera
  { cat: { name: 'Camera Equipment', division: 'camera', icon: 'videocam' }, subs: [
    { name: 'IP Camera',    fields: [{ key:'model', label:'Model', type:'text' }, { key:'resolution', label:'Resolution', type:'select', options:['2MP','4MP','5MP','8MP','12MP'] }, { key:'ipaddress', label:'IP Address', type:'text' }, { key:'macaddress', label:'MAC Address', type:'text' }] },
    { name: 'DVR/NVR',      fields: [{ key:'model', label:'Model', type:'text' }, { key:'channels', label:'Channels', type:'select', options:[4,8,16,32,64] }, { key:'storage', label:'Storage', type:'number', unit:'TB' }, { key:'ipaddress', label:'IP Address', type:'text' }] },
    { name: 'Camera Cable', fields: [{ key:'cabletype', label:'Cable Type', type:'select', options:['Coaxial','Cat6','Cat6A','Fiber'] }, { key:'length', label:'Length', type:'number', unit:'m' }] },
  ]},
  // ANPR
  { cat: { name: 'ANPR Equipment', division: 'anpr', icon: 'camera_outdoor' }, subs: [
    { name: 'ANPR Camera', fields: [{ key:'model', label:'Model', type:'text' }, { key:'laneid', label:'Lane ID', type:'text' }, { key:'ipaddress', label:'IP Address', type:'text' }, { key:'direction', label:'Direction', type:'select', options:['Entry','Exit','Both'] }] },
    { name: 'UPS',         fields: [{ key:'brand', label:'Brand', type:'text' }, { key:'capacity', label:'Capacity', type:'number', unit:'VA' }, { key:'batterylife', label:'Battery Life', type:'number', unit:'hrs' }, { key:'inputvolt', label:'Input Voltage', type:'number', unit:'V' }] },
    { name: 'Controller',  fields: [{ key:'model', label:'Model', type:'text' }, { key:'ipaddress', label:'IP Address', type:'text' }, { key:'lanes', label:'Lanes', type:'number', unit:'lanes' }] },
  ]},
];

setTimeout(async function() {
  try {
    for (var entry of SEED) {
      var cat = await Category.findOneAndUpdate(
        { name: entry.cat.name },
        { ...entry.cat, status: 'active' },
        { upsert: true, new: true }
      );
      console.log('Category:', cat.name);
      for (var sub of entry.subs) {
        await Subcategory.findOneAndUpdate(
          { name: sub.name, categoryId: cat._id },
          { ...sub, categoryId: cat._id, division: entry.cat.division, status: 'active' },
          { upsert: true, new: true }
        );
        console.log('  Subcategory:', sub.name);
      }
    }
    console.log('Seed complete');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}, 2000);
