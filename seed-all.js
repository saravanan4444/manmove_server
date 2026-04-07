// seed-all.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');

// ===== 0️⃣ Models (use __dirname for reliable paths) =====
const UserList  = require(path.join(__dirname, 'models', 'userList'));
const Zone      = require(path.join(__dirname, 'models', 'zones'));
const Company   = require(path.join(__dirname, 'models', 'companies'));
const Project   = require(path.join(__dirname, 'models', 'project'));
const Inventory = require(path.join(__dirname, 'models', 'inventory'));
const Category  = require(path.join(__dirname, 'models', 'category'));
const Admin     = require(path.join(__dirname, 'models', 'adminuser')); // Your admin model file

// ===== 1️⃣ MongoDB connection =====
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1/manmove';
mongoose.connect(mongoUri)  // Mongoose 7+ does not need options
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

mongoose.connection.once('open', async () => {
  try {
    const results = {};

    // ===== 2️⃣ Users =====
    const users = [
      { empId:'EMP001', name:'Arjun Kumar', role:'om', division:['anpr'], mobile:9876543210, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP002', name:'Priya Sharma', role:'pi', division:['anpr'], mobile:9876543211, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP003', name:'Ravi Selvam', role:'pi', division:['isp'], mobile:9876543212, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP004', name:'Meena Devi', role:'cc', division:['isp','camera'], mobile:9876543213, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP005', name:'Karthik Raja', role:'store_incharge', division:['isp','camera','anpr'], mobile:9876543214, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
      { empId:'EMP006', name:'Sundar Vel', role:'pi', division:['camera'], mobile:9876543215, status:'active', signinstatus:'SignedIn', password:'123456', company:'ManMove Networks' },
    ];

    // Hash passwords for new users
    for (let user of users) {
      user.password = await bcrypt.hash(user.password, 10);
    }

    const existingUsers = await UserList.find({ empId: { $in: users.map(u => u.empId) } });
    const existingIds = existingUsers.map(u => u.empId);
    const newUsers = users.filter(u => !existingIds.includes(u.empId));
    if (newUsers.length) {
      await UserList.insertMany(newUsers);
      console.log(`Inserted ${newUsers.length} new users`);
    } else {
      console.log('No new users to insert');
    }
    results.users = users.length;

    // ===== 3️⃣ Zones =====
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
    console.log(`Zones count: ${results.zones}`);

    // ===== 4️⃣ Inventory =====
    const invItems = [
      { name:'Huawei OLT MA5608T', type:'olt', division:'isp', company:'ManMove Networks', zone:'North Zone', serialNumber:'OLT-001', assetTag:'MN-OLT-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1200,lng:77.3500}, purchaseCost:85000, vendor:'Huawei', warrantyExpiry:new Date('2027-03-01') },
      { name:'TP-Link 24Port Switch', type:'switch', division:'isp', company:'ManMove Networks', zone:'North Zone', serialNumber:'SW-001', assetTag:'MN-SW-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1210,lng:77.3510}, purchaseCost:12000, vendor:'TP-Link' },
      { name:'Splitter 1:8 Box A', type:'splitter', division:'isp', company:'ManMove Networks', zone:'South Zone', serialNumber:'SP-001', assetTag:'MN-SP-001', lifecycleStatus:'deployed', condition:'good', latlng:{lat:11.0900,lng:77.3200}, purchaseCost:2500, vendor:'Corning' },
      { name:'ONT Huawei HG8245H', type:'ont', division:'isp', company:'ManMove Networks', zone:'South Zone', serialNumber:'ONT-001', assetTag:'MN-ONT-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.0910,lng:77.3210}, purchaseCost:3500, vendor:'Huawei' },
      { name:'Hikvision IP Cam 4MP', type:'ipcamera', division:'camera', company:'ManMove Networks', zone:'East Zone', serialNumber:'CAM-001', assetTag:'MN-CAM-001', lifecycleStatus:'in_service', condition:'good', latlng:{lat:11.1100,lng:77.3600}, purchaseCost:8500, vendor:'Hikvision' },
    ];

    let created = 0;
    for (const item of invItems) {
      const exists = await Inventory.findOne({ serialNumber: item.serialNumber }).catch(()=>null);
      if (!exists) {
        await Inventory.create({ ...item, status:'active' });
        created++;
      }
    }
    results.inventory = created;
    console.log(`Inventory inserted: ${created} new items`);

    // ===== 5️⃣ Admin =====
    const adminExists = await Admin.findOne({ username:'admin' });
    if (!adminExists) {
      const hashed = await bcrypt.hash('admin123', 10);
      await Admin.create({ username:'admin', password:hashed, role:'admin' });
      console.log('Admin user created!');
    } else {
      console.log('Admin already exists');
    }

    console.log('✅ Seeding completed:', JSON.stringify(results, null, 2));

  } catch(err) {
    console.error('Seeding error:', err);
  } finally {
    mongoose.disconnect();
  }
});