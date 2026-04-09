require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');

// ===== Models =====
const UserList  = require(path.join(__dirname, 'models', 'userList'));
const Zone      = require(path.join(__dirname, 'models', 'zones'));
const Inventory = require(path.join(__dirname, 'models', 'inventory'));
const Admin     = require(path.join(__dirname, 'models', 'adminuser'));

// ===== MongoDB Connection =====
const MONGO_URI = process.env.MONGO_URL;

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');
    console.log('📌 DB Name:', mongoose.connection.name);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

// ===== MAIN SEED FUNCTION =====
async function runSeed() {
  try {
    const results = {};

    // ===== 🧹 CLEAN BAD ADMIN RECORDS =====
    await Admin.deleteMany({ email: null });
    console.log('🧹 Cleaned invalid admin records');

    // ===== 👑 SUPER ADMIN =====
    const superAdminEmail = 'superadmin@manmove.in';

    const superAdminExists = await UserList.findOne({ email: superAdminEmail });

    if (!superAdminExists) {
      const hashedPassword = await bcrypt.hash('Test@1234', 10);

      await UserList.create({
        empId: 'SUPER001',
        name: 'Super Admin',
        email: superAdminEmail,
        password: hashedPassword,
        role: 'superadmin',
        division: ['all'],
        mobile: 9999999999,
        company: 'ManMove Networks',
        status: 'active',
        signinstatus: 'SignedOut'
      });

      console.log('👑 Super Admin created');
      results.superAdmin = 1;
    } else {
      console.log('👑 Super Admin already exists');
      results.superAdmin = 0;
    }

    // ===== 👤 USERS =====
    const users = [
      { empId:'EMP001', name:'Arjun Kumar',  role:'om', division:['anpr'], mobile:9876543210 },
      { empId:'EMP002', name:'Priya Sharma', role:'pi', division:['anpr'], mobile:9876543211 },
      { empId:'EMP003', name:'Ravi Selvam',  role:'pi', division:['isp'],  mobile:9876543212 },
      { empId:'EMP004', name:'Meena Devi',   role:'cc', division:['isp','camera'], mobile:9876543213 },
      { empId:'EMP005', name:'Karthik Raja', role:'store_incharge', division:['isp','camera','anpr'], mobile:9876543214 },
      { empId:'EMP006', name:'Sundar Vel',   role:'pi', division:['camera'], mobile:9876543215 },
    ];

    let createdUsers = 0;

    for (let user of users) {
      const email = `${user.empId.toLowerCase()}@manmove.com`;

      const exists = await UserList.findOne({
        $or: [{ empId: user.empId }, { email }]
      });

      if (!exists) {
        const hashedPassword = await bcrypt.hash('123456', 10);

        await UserList.create({
          ...user,
          email,
          password: hashedPassword,
          company: 'ManMove Networks',
          status: 'active',
          signinstatus: 'SignedIn'
        });

        createdUsers++;
      }
    }

    console.log(`👤 Users inserted: ${createdUsers}`);
    results.users = createdUsers;

    // ===== 🌍 ZONES =====
    const zones = ['North Zone', 'South Zone', 'East Zone'];
    let createdZones = 0;

    for (let name of zones) {
      const exists = await Zone.findOne({ name });

      if (!exists) {
        await Zone.create({
          name,
          company: 'ManMove Networks',
          status: 'active'
        });
        createdZones++;
      }
    }

    console.log(`🌍 Zones inserted: ${createdZones}`);
    results.zones = createdZones;

    // ===== 📦 INVENTORY =====
    const invItems = [
      { name:'Huawei OLT MA5608T', serialNumber:'OLT-001', type:'olt', zone:'North Zone' },
      { name:'TP-Link 24Port Switch', serialNumber:'SW-001', type:'switch', zone:'North Zone' },
      { name:'Splitter 1:8 Box A', serialNumber:'SP-001', type:'splitter', zone:'South Zone' },
      { name:'ONT Huawei HG8245H', serialNumber:'ONT-001', type:'ont', zone:'South Zone' },
      { name:'Hikvision IP Cam 4MP', serialNumber:'CAM-001', type:'ipcamera', zone:'East Zone' },
    ];

    let createdInventory = 0;

    for (const item of invItems) {
      const exists = await Inventory.findOne({ serialNumber: item.serialNumber });

      if (!exists) {
        await Inventory.create({
          ...item,
          company: 'ManMove Networks',
          division: item.type === 'ipcamera' ? 'camera' : 'isp',
          status: 'active',
          lifecycleStatus: 'in_service',
          condition: 'good'
        });

        createdInventory++;
      }
    }

    console.log(`📦 Inventory inserted: ${createdInventory}`);
    results.inventory = createdInventory;

    // ===== 🔐 ADMIN (FIXED) =====
    const adminEmail = 'admin@manmove.in';

    const adminExists = await Admin.findOne({ email: adminEmail });

    if (!adminExists) {
      const hashed = await bcrypt.hash('admin123', 10);

      await Admin.create({
        username: 'admin',
        email: adminEmail,                // ✅ FIX
        company: 'ManMove Networks',      // ✅ FIX
        password: hashed,
        role: 'admin',
        status: 'active'
      });

      console.log('🔐 Admin created');
      results.admin = 1;
    } else {
      console.log('🔐 Admin already exists');
      results.admin = 0;
    }

    console.log('\n✅ Seeding completed:', JSON.stringify(results, null, 2));

  } catch (err) {
    console.error('❌ Seeding error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from DB');
  }
}

// ===== RUN =====
(async () => {
  await connectDB();
  await runSeed();
})();