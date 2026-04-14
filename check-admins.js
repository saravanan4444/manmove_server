require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/adminuser');

async function run() {
    await mongoose.connect(process.env.MONGO_URL);
    const admins = await Admin.find({}, { email: 1, role: 1, status: 1 });
    console.log('Admins in DB:', JSON.stringify(admins, null, 2));
    await mongoose.disconnect();
}

run().catch(console.error);
