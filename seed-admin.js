require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Admin = require('./models/adminuser');

async function run() {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('DB:', mongoose.connection.name);

    const email = 'admin@manmove.in';
    const exists = await Admin.findOne({ email });
    if (exists) return console.log('Admin already exists:', email);

    await Admin.create({
        name: 'Admin',
        email,
        password: await bcrypt.hash('Admin@1234', 10),
        role: 'superadmin',
        status: 'active',
        division: ['isp', 'camera', 'anpr'],
    });
    console.log('✅ Admin created — email:', email, '| password: Admin@1234');
    await mongoose.disconnect();
}

run().catch(console.error);
