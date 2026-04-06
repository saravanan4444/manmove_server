const express   = require('express');
const router    = express.Router();
const Contract  = require('../models/contracts');
const WorkOrder = require('../models/workorders');
const Asset     = require('../models/assets');
const { authenticate, scopeToTenant, permit, permitMatrix, SUPERADMIN_ROLES } = require('../config/authMiddleware');
const { log } = require('../config/auditLog');

// ── Contracts ──
router.get('/contracts', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = {};
        if (req.query.company)  query.company  = req.query.company;
        if (req.query.division) query.division = req.query.division;
        if (req.query.status)   query.status   = req.query.status;
        res.status(200).json({ status: 200, data: await Contract.find(query).sort({ created_at: -1 }).lean() });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/contracts', authenticate, scopeToTenant, permitMatrix('contracts', 'create'), async (req, res) => {
    try {
        const data = await Contract.create(req.body);
        await log({ req, action: 'CONTRACT_CREATE', resource: 'contracts', resourceId: data._id, after: { title: data.title, company: data.company } });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
// Specific sub-routes BEFORE /:id param routes
router.get('/contracts/expiring', authenticate, async (req, res) => {
    try {
        const now = new Date(), in30 = new Date(now.getTime() + 30 * 24 * 3600000);
        const query = { end_date: { $gte: now, $lte: in30 }, status: 'active' };
        if (!['superadmin','administrator'].includes(req.user.role)) query.company = req.user.company;
        res.status(200).json({ status: 200, data: await Contract.find(query).lean() });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/contracts/:id', authenticate, permitMatrix('contracts', 'update'), async (req, res) => {
    try {
        const existing = await Contract.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company edit' });
        res.status(200).json({ status: 200, data: await Contract.findByIdAndUpdate(req.params.id, req.body, { new: true }) });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/contracts/:id', authenticate, permitMatrix('contracts', 'delete'), async (req, res) => {
    try {
        const before = await Contract.findById(req.params.id).lean();
        if (!before) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && before.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company delete' });
        await Contract.findByIdAndDelete(req.params.id);
        await log({ req, action: 'CONTRACT_DELETE', resource: 'contracts', resourceId: req.params.id, before: { title: before?.title, company: before?.company } });
        res.status(200).json({ status: 200, message: 'Deleted' });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Work Orders ──
router.get('/workorders', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = {};
        if (req.query.company)     query.company     = req.query.company;
        if (req.query.status)      query.status      = req.query.status;
        if (req.query.priority)    query.priority    = req.query.priority;
        if (req.query.contract_id) query.contract_id = req.query.contract_id;
        res.status(200).json({ status: 200, data: await WorkOrder.find(query).sort({ created_at: -1 }).lean() });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/workorders', authenticate, scopeToTenant, permitMatrix('contracts', 'create'), async (req, res) => {
    try {
        const data = await WorkOrder.create(req.body);
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/workorders/:id', authenticate, permitMatrix('contracts', 'update'), async (req, res) => {
    try {
        const existing = await WorkOrder.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company edit' });
        const upd = Object.assign({}, req.body, { updated_at: new Date() });
        if (upd.status === 'assigned' && !upd.responded_at) upd.responded_at = new Date();
        if (upd.status === 'resolved' && !upd.resolved_at)  upd.resolved_at  = new Date();
        const data = await WorkOrder.findByIdAndUpdate(req.params.id, upd, { new: true });
        if (data.resolved_at && data.reported_at && data.contract_id) {
            const contract = await Contract.findById(data.contract_id);
            const slaHrs = contract ? contract.resolution_sla_hours : 24;
            const hrs = (new Date(data.resolved_at) - new Date(data.reported_at)) / 3600000;
            await WorkOrder.findByIdAndUpdate(data._id, { sla_breached: hrs > slaHrs });
        }
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/workorders/:id', authenticate, permitMatrix('contracts', 'delete'), async (req, res) => {
    try {
        const existing = await WorkOrder.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company delete' });
        await WorkOrder.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Assets ──
router.get('/assets', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = {};
        if (req.query.company)     query.company     = req.query.company;
        if (req.query.contract_id) query.contract_id = req.query.contract_id;
        res.status(200).json({ status: 200, data: await Asset.find(query).sort({ created_at: -1 }).lean() });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/assets', authenticate, scopeToTenant, permitMatrix('contracts', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Asset.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/assets/:id', authenticate, permitMatrix('contracts', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Asset.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/assets/:id', authenticate, permitMatrix('contracts', 'delete'), async (req, res) => {
    try { await Asset.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Contract Stats ──
router.get('/contractstats', authenticate, async (req, res) => {
    try {
        const isSuperAdmin = ['superadmin','administrator'].includes(req.user.role);
        const query = isSuperAdmin ? {} : { company: req.user.company };
        const now = new Date(), in30 = new Date(now.getTime() + 30 * 24 * 3600000);
        const [activeContracts, expiringContracts, openWorkOrders, slaBreached] = await Promise.all([
            Contract.countDocuments({ ...query, status: 'active' }),
            Contract.countDocuments({ ...query, status: 'active', end_date: { $gte: now, $lte: in30 } }),
            WorkOrder.countDocuments({ ...query, status: { $in: ['open','assigned','in_progress'] } }),
            WorkOrder.countDocuments({ ...query, sla_breached: true, status: { $ne: 'closed' } }),
        ]);
        res.status(200).json({ status: 200, activeContracts, expiringContracts, openWorkOrders, slaBreached });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
