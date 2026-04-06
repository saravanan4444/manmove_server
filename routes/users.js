const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcrypt');
const userList = require('../models/userList');
const { authenticate, scopeToTenant, permitMatrix } = require('../config/authMiddleware');

const SALT_ROUNDS = 12;

// ── List users (both /alluser and /allUser for backward compat) ───────────────
async function listUsers(req, res) {
    try {
        const query = {};
        if (req.query.status)  query.status  = req.query.status;
        if (req.query.company) query.company = req.query.company;
        if (req.query.zone)    query.zone    = req.query.zone;
        const data = await userList.find(query).sort({ created_at: -1 });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
}
router.get('/allUser', authenticate, scopeToTenant, listUsers);
router.get('/alluser', authenticate, scopeToTenant, listUsers);

router.get('/userstatus/:id', authenticate, async (req, res) => {
    try {
        const post = await userList.findOne({ empId: req.params.id })
            .select('empId name role imgUrl lastlogin lastlogout signinstatus').lean();
        if (!post) return res.status(200).json({ status: 404, message: 'User not found' });
        res.status(200).json({ status: 200, data: post });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/adduser', authenticate, permitMatrix('users', 'create'), async (req, res) => {
    try {
        const data = { ...req.body };
        if (!data.password) return res.status(200).json({ status: 400, message: 'Password required' });

        const [empExists, emailExists, mobileExists] = await Promise.all([
            data.empId ? userList.exists({ empId: data.empId }) : null,
            data.email && data.company ? userList.exists({ email: data.email, company: data.company }) : null,
            data.mobile && data.company ? userList.exists({ mobile: data.mobile, company: data.company }) : null,
        ]);
        if (empExists)    return res.status(200).json({ status: 400, message: `Employee ID "${data.empId}" already exists` });
        if (emailExists)  return res.status(200).json({ status: 400, message: `Email "${data.email}" already registered in this company` });
        if (mobileExists) return res.status(200).json({ status: 400, message: `Mobile "${data.mobile}" already registered in this company` });

        data.password = await bcrypt.hash(data.password, SALT_ROUNDS);
        const doc = await userList.create(data);
        res.status(200).json({ status: 200, id: doc.id });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/user/:id', authenticate, permitMatrix('users', 'update'), async (req, res) => {
    try {
        const post = await userList.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!post) return res.status(200).json({ status: 404, message: 'User not found' });
        res.status(200).json({ status: 200, id: post.id });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/userstats', authenticate, async (req, res) => {
    try {
        const query = {};
        if (req.query.company) query.company = req.query.company;
        if (req.query.zone)    query.zone    = req.query.zone;
        const [total, employees, vendors, signedIn] = await Promise.all([
            userList.countDocuments(query),
            userList.countDocuments({ ...query, role: { $ne: 'vendor' } }),
            userList.countDocuments({ ...query, role: 'vendor' }),
            userList.countDocuments({ ...query, signinstatus: 'in' }),
        ]);
        res.status(200).json({ status: 200, total, employees, vendors, signedIn, signedOut: total - signedIn });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/logincount', authenticate, async (req, res) => {
    try {
        const query = {};
        if (req.query.company) query.company = req.query.company;
        if (req.query.zone)    query.zone    = req.query.zone;
        const data = await userList.find(query).sort({ updated_at: -1 }).limit(20).lean();
        const signedIn = data.filter(u => u.status === 'active').length;
        const activityData = data.map(u => ({
            name: u.name, empId: u.empId,
            date: u.updated_at || u.created_at,
            action: u.signinstatus === 'in' ? 'Signed In' : u.signinstatus === 'out' ? 'Signed Out' : 'Active',
        }));
        res.status(200).json({ status: 200, total: data.length, signedIn, signedOut: data.length - signedIn, data: activityData });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/updatelocation', authenticate, async (req, res) => {
    const { empId, lat, lng } = req.body;
    if (!empId || !lat || !lng) return res.status(200).json({ status: 400, message: 'empId, lat, lng required' });
    try {
        const doc = await userList.findOneAndUpdate(
            { empId },
            { $set: { lat, lng, lastlat: lat, lastlng: lng, lastLocationAt: new Date() } },
            { new: true }
        );
        if (!doc) return res.status(200).json({ status: 500, message: 'User not found' });
        res.status(200).json({ status: 200, message: 'Location updated' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/location/:id', authenticate, async (req, res) => {
    try {
        const now   = new Date();
        const today = now.toLocaleDateString('en-IN');
        const resp  = await userList.findOne({ empId: req.params.id }).lean();
        if (!resp) return res.status(200).json({ status: 500, message: 'User not found' });
        const lastDay = resp.lastlogin ? new Date(resp.lastlogin).toLocaleDateString('en-IN') : '';
        const pushData = {
            $push: { attendance: { Date: today, signintime: req.body.signintime, signinlocation: { lat: req.body.lat, lng: req.body.lng, add: req.body.add }, signouttime: '', signoutlocation: { lat: '', lng: '' } } }
        };
        if (lastDay !== today) pushData.$push['activities'] = { Date: today, Data: [{ time: now.toTimeString(), location: { lat: req.body.lat, lng: req.body.lng } }] };
        await Promise.all([
            userList.findOneAndUpdate({ empId: req.params.id }, pushData),
            userList.findOneAndUpdate({ empId: req.params.id }, { lastlogin: req.body.signintime, signinstatus: 'SignedIn' }),
        ]);
        res.status(200).json({ status: 200 });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/position/:id', authenticate, async (req, res) => {
    try {
        await userList.findOneAndUpdate(
            { empId: req.params.id, 'activities.Date': new Date().toLocaleDateString() },
            { $push: { 'activities.$.Data': { time: new Date().toTimeString(), location: { lat: req.body.lat, lng: req.body.lng } } } }
        );
        res.status(200).json({ status: 200 });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/signout/:id', authenticate, async (req, res) => {
    try {
        await Promise.all([
            userList.findOneAndUpdate(
                { empId: req.params.id, 'attendance.signintime': req.body.signintime },
                { $set: { 'attendance.$.signouttime': new Date().toISOString(), 'attendance.$.signoutlocation': { lat: req.body.lat, lng: req.body.lng, add: req.body.add } } }
            ),
            userList.findOneAndUpdate({ empId: req.params.id }, { lastlogout: new Date().toISOString(), signinstatus: 'SignedOut' }),
        ]);
        res.status(200).json({ status: 200 });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/userattendance/:empId', authenticate, async (req, res) => {
    try {
        const data = await userList.findOne({ empId: req.params.empId, status: 'active' }).lean();
        if (!data) return res.status(200).json({ status: 404, message: 'User not found' });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
