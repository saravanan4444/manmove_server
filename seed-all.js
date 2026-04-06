// seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Models (relative paths, adjust if your folder structure differs)
const UserList  = require('./models/userList');
const Zone      = require('./models/zones');
const Company   = require('./models/companies');
const Project   = require('./models/project');
const Inventory = require('./models/inventory');
const Category  = require('./models/category');
const Admin     = require('./models/admin'); // Create this model if not exists

// MongoDB connection (uses env variable or fallback to local)
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1/manmove';
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

mongoose.connection.once('open', async () => {
  try {
    const results = {};

    // ===== 1️⃣ Users =====
    const users = [
      { empId:'EMP001', name:'Arjun Kumar', role:'om', division:['anpr'], mobile:9876543210, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP002', name:'Priya Sharma', role:'pi', division:['anpr'], mobile:9876543211, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP003', name:'Ravi Selvam', role:'pi', division:['isp'], mobile:9876543212, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP004', name:'Meena Devi', role:'cc', division:['isp','camera'], mobile:9876543213, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP005', name:'Karthik Raja', role:'store_incharge', division:['isp','camera','anpr'], mobile:9876543214, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP006', name:'Sundar Vel', role:'pi', division:['camera'], mobile:9876543215, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
    ];

    const existingUsers = await UserList.find({ empId: { $in: users.map(u => u.empId) } });
    const existingIds = existingUsers.map(u => u.empId);
    const newUsers = users.filter(u => !existingIds.includes(u.empId));
    if (newUsers.length) await UserList.insertMany(newUsers);
    results.users = users.length;

    // ===== 2️⃣ Zones =====
    const zones = [
      { name:'North Zone', company:'ManMove Networks', status:'active' },
      { name:'South Zone', company:'ManMove Networks', status:'active' },
      { name:'East Zone',  company:'ManMove Networks', status:'active' },
    ];
    for (const z of zones) {
      const exists = await Zone.findOne({ name: z.name });
      if (!exists) await Zone.create(z);
    }
    results.zones = await Zone.countDocuments({ company:'ManMove Networks' });

    // ===== 3️⃣ Inventory =====
    const invItems = [
      { name:'Huawei OLT MA5608T', type:'olt', division:'isp', company:'ManMove Networks', zone:'North Zone', serialNumber:'OLT-001', assetTag:'MN-OLT-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1200,lng:77.3500}, purchaseCost:85000, vendor:'Huawei', warrantyExpiry:new Date('2027-03-01') },
      { name:'TP-Link 24Port Switch', type:'switch', division:'isp', company:'ManMove Networks', zone:'North Zone', serialNumber:'SW-001', assetTag:'MN-SW-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1210,lng:77.3510}, purchaseCost:12000, vendor:'TP-Link' },
      { name:'Splitter 1:8 Box A', type:'splitter', division:'isp', company:'ManMove Networks', zone:'South Zone', serialNumber:'SP-001', assetTag:'MN-SP-001', lifecycleStatus:'deployed', condition:'good', latlng:{lat:11.0900,lng:77.3200}, purchaseCost:2500, vendor:'Corning' },
      { name:'ONT Huawei HG8245H', type:'ont', division:'isp', company:'ManMove Networks', zone:'South Zone', serialNumber:'ONT-001', assetTag:'MN-ONT-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.0910,lng:77.3210}, purchaseCost:3500, vendor:'Huawei' },
      { name:'Hikvision IP Cam 4MP', type:'ipcamera', division:'camera', company:'ManMove Networks', zone:'East Zone', serialNumber:'CAM-001', assetTag:'MN-CAM-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1100,lng:77.3600}, purchaseCost:8500, vendor:'Hikvision' },
      { name:'Dahua DVR 16CH', type:'dvrnvr', division:'camera', company:'ManMove Networks', zone:'East Zone', serialNumber:'DVR-001', assetTag:'MN-DVR-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1110,lng:77.3610}, purchaseCost:22000, vendor:'Dahua' },
      { name:'ANPR Camera Axis P32', type:'anprcamera', division:'anpr', company:'ManMove Networks', zone:'North Zone', serialNumber:'ANC-001', assetTag:'MN-ANC-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1300,lng:77.3700}, purchaseCost:45000, vendor:'Axis' },
      { name:'UPS APC 1KVA', type:'ups', division:'anpr', company:'ManMove Networks', zone:'North Zone', serialNumber:'UPS-001', assetTag:'MN-UPS-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1310,lng:77.3710}, purchaseCost:18000, vendor:'APC' },
      { name:'Controller Unit C1', type:'controller', division:'anpr', company:'ManMove Networks', zone:'North Zone', serialNumber:'CTL-001', assetTag:'MN-CTL-001', lifecycleStatus:'warehouse', condition:'good', purchaseCost:35000, vendor:'Local' },
      { name:'GI Pole 6m', type:'pole', division:'isp', company:'ManMove Networks', zone:'South Zone', serialNumber:'POL-001', assetTag:'MN-POL-001', lifecycleStatus:'deployed', condition:'good', latlng:{lat:11.0950,lng:77.3250}, purchaseCost:4500, vendor:'Steel Corp' },
    ];

    let created = 0;
    for (const item of invItems) {
      const exists = await Inventory.findOne({ serialNumber: item.serialNumber }).catch(()=>null);
      if (!exists) {
        await Inventory.create({ ...item, status:'active' });
        created++;
      }
    }
    results.inventory = created + ' new items';

    // ===== 4️⃣ Admin user =====
    const adminExists = await Admin.findOne({ username:'admin' });
    if (!adminExists) {
      const hashed = await bcrypt.hash('admin123', 10);
      await Admin.create({ username:'admin', password:hashed, role:'admin' });
      console.log('Admin user created!');
    } else {
      console.log('Admin already exists');
    }

    console.log('Seed completed:', JSON.stringify(results, null, 2));

  } catch(err) {
    console.error('Seeding error:', err);
  } finally {
    mongoose.disconnect();
  }
});