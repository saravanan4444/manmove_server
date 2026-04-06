/**
 * Legacy routes — alldata, upload, packages, availableid, checkavail,
 * changepass, userfcm, fiberroute, deploymentlogs extras, poles/bulk,
 * poletimeline, anprsenddelayalerts, log
 */
const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcrypt');
const Data      = require('../models/product');       // ISP applicant data
const Package   = require('../models/package');       // ISP packages
const userList  = require('../models/userList');
const Pole      = require('../models/pole');
const DeploymentLog = require('../models/deploymentlog');
const SystemLog = require('../models/systemlog');
const { authenticate, scopeToTenant, permit, permitMatrix, SUPERADMIN_ROLES } = require('../config/authMiddleware');

// ── ISP Applicant Data (alldata / upload / data/:id) ──────────────────────
async function listData(req, res) {
    try {
        const query = safeQuery(req.query, ['status', 'company', 'zone', 'area']);
        const data = await Data.find(query).sort({ created_at: -1 }).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
}
router.get('/alldata',  authenticate, scopeToTenant, listData);
router.get('/alldata/', authenticate, scopeToTenant, listData);

router.post('/upload', authenticate, scopeToTenant, permitMatrix('leads', 'create'), async (req, res) => {
    try {
        const doc = await Data.create(req.body);
        res.status(200).json({ status: 200, id: doc._id });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/data/:id', authenticate, permitMatrix('leads', 'update'), async (req, res) => {
    try {
        const existing = await Data.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company edit' });
        await Data.findByIdAndUpdate(req.params.id, req.body);
        res.status(200).json({ status: 200 });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── ISP Packages ──────────────────────────────────────────────────────────
router.get('/allupload', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = safeQuery(req.query, ['status','company','zone']);
        const data = await Package.find(query).sort({ created_at: -1 }).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/uploadpdf', authenticate, permitMatrix('leads', 'create'), async (req, res) => {
    try {
        const doc = await Package.create(req.body);
        res.status(200).json({ status: 200, id: doc._id });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/upload/:id', authenticate, permitMatrix('leads', 'update'), async (req, res) => {
    try {
        await Package.findByIdAndUpdate(req.params.id, req.body);
        res.status(200).json({ status: 200 });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Available ID — scoped to company ─────────────────────────────────────
router.get('/availableid', authenticate, async (req, res) => {
    try {
        const company = req.user.company || req.query.company;
        const query = company ? { company } : {};
        const last = await Data.findOne(query).sort({ appno: -1 });
        const nextId = last && last.appno ? last.appno + 1 : 1001;
        res.status(200).json({ status: 200, id: nextId });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/availablecustid', authenticate, async (req, res) => {
    try {
        const company = req.user.company || req.query.company;
        const query = company ? { company } : {};
        const count = await Data.countDocuments(query);
        res.status(200).json({ status: 200, id: 'CUST' + String(count + 1).padStart(4, '0') });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/checkavail', authenticate, async (req, res) => {
    try {
        const query = {};
        if (req.query.latitude)  query.latitude  = String(req.query.latitude);
        if (req.query.longitude) query.longitude = String(req.query.longitude);
        if (req.query.pin)       query.pin        = String(req.query.pin);
        const company = req.user.company || req.query.company;
        if (company) query.company = company;
        const exists = await Data.findOne(query);
        res.status(200).json({ status: 200, available: !exists });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── CSV Import stubs ──────────────────────────────────────────────────────
router.post('/importcsv', authenticate, (req, res) => {
    res.status(200).json({ status: 501, message: 'CSV import not implemented on this server' });
});
router.post('/importcus', authenticate, (req, res) => {
    res.status(200).json({ status: 501, message: 'Customer CSV import not implemented on this server' });
});

// ── Change Password ────────────────────────────────────────────────────────
router.post('/changepass', authenticate, async (req, res) => {
    const { empId, oldPassword, newPassword } = req.body;
    if (!empId || !oldPassword || !newPassword)
        return res.status(200).json({ status: 400, message: 'empId, oldPassword, newPassword required' });
    try {
        const user = await userList.findOne({ empId });
        if (!user) return res.status(200).json({ status: 404, message: 'User not found' });
        const match = await bcrypt.compare(oldPassword, user.password);
        if (!match) return res.status(200).json({ status: 401, message: 'Old password incorrect' });
        await userList.findByIdAndUpdate(user._id, { password: await bcrypt.hash(newPassword, 12) });
        res.status(200).json({ status: 200, message: 'Password changed successfully' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── FCM Token ─────────────────────────────────────────────────────────────
router.get('/userfcm/:id', authenticate, async (req, res) => {
    try {
        const user = await userList.findOne({ empId: req.params.id });
        if (!user) return res.status(200).json({ status: 404, message: 'User not found' });
        res.status(200).json({ status: 200, fcmToken: user.fcmToken || null });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/userfcm/:id', authenticate, async (req, res) => {
    try {
        await userList.findOneAndUpdate({ empId: req.params.id }, { fcmToken: req.body.fcmToken });
        res.status(200).json({ status: 200, message: 'FCM token updated' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Fiber Routes ───────────────────────────────────────────────────────────
let FiberRoute;
try { FiberRoute = require('../models/fiberroute'); } catch (_) {
    const mongoose = require('mongoose');
    const s = new mongoose.Schema({ name: String, coordinates: Array, type: String, company: String, notes: String, created_at: { type: Date, default: Date.now } });
    FiberRoute = mongoose.model('fiberroutes', s);
}

router.get('/allfiberroute', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = {};
        if (req.query.company) query.company = req.query.company;
        const data = await FiberRoute.find(query).sort({ created_at: -1 });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/fiberroute', authenticate, scopeToTenant, permitMatrix('leads', 'create'), async (req, res) => {
    try {
        if (!SUPERADMIN_ROLES.includes(req.user.role) && req.user.company)
            req.body.company = req.user.company;
        const doc = await FiberRoute.create(req.body);
        res.status(200).json({ status: 200, data: doc });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/fiberroute/:id', authenticate, permitMatrix('leads', 'update'), async (req, res) => {
    try {
        const existing = await FiberRoute.findById(req.params.id).lean();
        if (existing && !SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company edit' });
        const doc = await FiberRoute.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ status: 200, data: doc });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.delete('/fiberroute/:id', authenticate, permitMatrix('leads', 'delete'), async (req, res) => {
    try {
        await FiberRoute.findByIdAndDelete(req.params.id);
        res.status(200).json({ status: 200, message: 'Deleted' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Deployment log extras ──────────────────────────────────────────────────
router.get('/deploymentlogs/mapdata', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = { status: 'active' };
        if (req.query.company)  query.company  = req.query.company;
        if (req.query.division) query.division = req.query.division;
        const data = await DeploymentLog.find(query, 'itemName eventType location company division performedBy eventDate').lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/deploymentlogs/stats', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = { status: 'active' };
        if (req.query.company)  query.company  = req.query.company;
        if (req.query.division) query.division = req.query.division;
        const all = await DeploymentLog.find(query).lean();
        const byStage = all.reduce((acc, d) => { const k = d.eventType || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const thisWeek = all.filter(d => new Date(d.eventDate || d.createdAt) >= weekAgo).length;
        const faultsReported = all.filter(d => d.eventType === 'faulty_reported').length;
        const maintenanceDone = all.filter(d => d.eventType === 'maintenance').length;
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
        const costThisMonth = all.filter(d => new Date(d.eventDate || d.createdAt) >= monthStart).reduce((s, d) => s + (d.cost || 0), 0);
        res.status(200).json({ status: 200, data: { total: all.length, byStage, thisWeek, faultsReported, maintenanceDone, costThisMonth } });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Poles bulk + poletimeline list ────────────────────────────────────────
router.post('/poles/bulk', authenticate, permitMatrix('leads', 'create'), async (req, res) => {
    try {
        const poles = Array.isArray(req.body) ? req.body : req.body.poles;
        if (!poles?.length) return res.status(200).json({ status: 400, message: 'poles array required' });
        const docs = await Pole.insertMany(poles, { ordered: false });
        res.status(200).json({ status: 200, inserted: docs.length });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/poletimeline', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = {};
        if (req.query.company) query.company = req.query.company;
        if (req.query.project) query.project = req.query.project;
        const data = await Pole.find(query, 'name stage stageHistory company project').sort({ created_at: -1 }).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── ANPR send delay alerts ─────────────────────────────────────────────────
router.post('/anprsenddelayalerts', authenticate, async (req, res) => {
    try {
        // Log the alert action — actual FCM sending is handled by the app
        await SystemLog.create({
            action: 'ANPR_DELAY_ALERT_SENT',
            entity: 'anpr',
            description: `Delay alerts sent for ${req.body?.projectId || 'all projects'}`,
            user_name: req.user?.name || '',
            user_id:   req.user?.id   || '',
            company:   req.user?.company || '',
            ip:        req.ip || '',
            status:    'success'
        });
        res.status(200).json({ status: 200, message: 'Alert logged' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Single log entry ───────────────────────────────────────────────────────
router.post('/log', authenticate, async (req, res) => {
    try {
        await SystemLog.create({
            action:      req.body.action      || 'APP_LOG',
            entity:      req.body.entity      || 'app',
            entity_id:   req.body.entity_id   || '',
            description: req.body.description || '',
            user_name:   req.user?.name       || req.body.user_name || '',
            user_id:     req.user?.id         || req.body.user_id   || '',
            company:     req.user?.company    || req.body.company   || '',
            ip:          req.ip               || '',
            status:      req.body.status      || 'success',
        });
        res.status(200).json({ status: 200, message: 'Logged' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
