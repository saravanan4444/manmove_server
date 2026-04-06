const express  = require('express');
const router   = express.Router();
const News     = require('../models/news');
const threads  = require('../models/threads');
const logs     = require('../models/logs');
const SystemLog = require('../models/systemlog');
const { authenticate, scopeToTenant, permitMatrix, requireSuperadmin, SUPERADMIN_ROLES } = require('../config/authMiddleware');
const Settings = require('../models/settings');

// safe query builder — prevents NoSQL injection via req.query
function safeQuery(raw, allowed) {
    const q = {};
    allowed.forEach(k => { if (raw[k] !== undefined && typeof raw[k] === 'string') q[k] = raw[k]; });
    return q;
}

// ── News ──
router.get('/allnews', authenticate, scopeToTenant, async (req, res) => {
    try { res.status(200).json({ status: 200, data: await News.find(safeQuery(req.query, ['company','status','zone'])).lean() }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/addnews', authenticate, permitMatrix('leads', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await News.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/news/:id', authenticate, permitMatrix('leads', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await News.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Threads ──
router.get('/allthread', authenticate, scopeToTenant, async (req, res) => {
    try { res.status(200).json({ status: 200, data: await threads.find(safeQuery(req.query, ['company','status','zone','assignedTo'])).lean() }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.get('/thread/:id', authenticate, async (req, res) => {
    try {
        const data = await threads.findById(req.params.id);
        if (!data) return res.status(200).json({ status: 404, message: 'Not found' });
        res.status(200).json({ status: 200, data });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/thread', authenticate, permitMatrix('leads', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await threads.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/thread/:id', authenticate, permitMatrix('leads', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await threads.findByIdAndUpdate(req.params.id, req.body, { new: true, strict: false }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/thread/:id', authenticate, permitMatrix('leads', 'delete'), async (req, res) => {
    try { await threads.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Activity Logs ──
router.get('/alllogs', authenticate, scopeToTenant, async (req, res) => {
    try { res.status(200).json({ status: 200, data: await logs.find(safeQuery(req.query, ['company','status','zone'])).sort({ created_at: -1 }).lean() }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/alllogs', authenticate, scopeToTenant, async (req, res) => {
    try { res.status(200).json({ status: 200, data: await logs.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── System Logs — enforce company scope for non-superadmin ──
router.get('/systemlogs', authenticate, async (req, res) => {
    try {
        const query = {};
        if (!SUPERADMIN_ROLES.includes(req.user.role)) query.company = req.user.company;
        else if (req.query.company) query.company = req.query.company;
        if (req.query.entity)  query.entity  = req.query.entity;
        if (req.query.action)  query.action  = req.query.action;
        if (req.query.status)  query.status  = req.query.status;
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const skip  = parseInt(req.query.skip) || 0;
        const data  = await SystemLog.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Brand Settings — persistent DB, scoped to company ──
router.get('/settings/brand', authenticate, async (req, res) => {
    try {
        const company = req.user?.company || 'default';
        const doc = await Settings.findOne({ company }).lean();
        res.status(200).json({ status: 200, data: doc?.brand || {} });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/settings/brand', authenticate, async (req, res) => {
    try {
        // SuperAdmin can pass a target company; Company Admin is locked to their own
        const company = SUPERADMIN_ROLES.includes(req.user?.role)
            ? (req.body.company || req.user?.company || 'default')
            : (req.user?.company || 'default');
        const { company: _stripped, ...brand } = req.body; // strip company from brand payload
        const doc = await Settings.findOneAndUpdate(
            { company },
            { $set: { brand } },
            { upsert: true, new: true }
        );
        res.status(200).json({ status: 200, data: doc.brand });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
