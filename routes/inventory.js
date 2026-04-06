const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');
const Inventory = require('../models/inventory');
const Category  = require('../models/category');
const Subcategory = require('../models/subcategory');
const DeploymentLog  = require('../models/deploymentlog');
const DeploymentTask = require('../models/deploymenttask');
const BOM        = require('../models/bom');
const { authenticate, scopeToTenant, permit, permitMatrix, SUPERADMIN_ROLES } = require('../config/authMiddleware');
const { log } = require('../config/auditLog');

const LIFECYCLE_MAP = {
    deployed: 'deployed', inspection: 'in_service', maintenance: 'maintenance',
    repair: 'in_service', replacement: 'in_service', relocated: 'deployed',
    faulty_reported: 'faulty', decommissioned: 'retired', received: 'procurement', warehouse: 'warehouse'
};

// ── Inventory ──
router.get('/allinventory', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = { status: 'active' };
        if (req.query.type)            query.type            = req.query.type;
        if (req.query.subcategoryId)   query.subcategoryId   = req.query.subcategoryId;
        if (req.query.categoryId)      query.categoryId      = req.query.categoryId;
        if (req.query.company)         query.company         = req.query.company;
        if (req.query.division)        query.division        = req.query.division;
        if (req.query.zone)            query.zone            = req.query.zone;
        if (req.query.lifecycleStatus) query.lifecycleStatus = req.query.lifecycleStatus;
        if (req.query.search) {
            query.$or = [
                { name:         { $regex: req.query.search, $options: 'i' } },
                { serialNumber: { $regex: req.query.search, $options: 'i' } },
                { barcode:      { $regex: req.query.search, $options: 'i' } },
                { assetTag:     { $regex: req.query.search, $options: 'i' } }
            ];
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const skip  = parseInt(req.query.skip) || 0;
        const data  = await Inventory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/inventorystats', authenticate, scopeToTenant, async (req, res) => {
    try {
        const base = { status: 'active' };
        if (req.query.company)  base.company  = req.query.company;
        if (req.query.division) base.division = req.query.division;
        const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30);
        const [total, deployed, inStock, faulty, warrantyExpiring] = await Promise.all([
            Inventory.countDocuments(base),
            Inventory.countDocuments({ ...base, lifecycleStatus: { $in: ['deployed','in_service'] } }),
            Inventory.countDocuments({ ...base, lifecycleStatus: 'warehouse' }),
            Inventory.countDocuments({ ...base, lifecycleStatus: 'faulty' }),
            Inventory.countDocuments({ ...base, warrantyExpiry: { $lte: thirtyDays, $gte: new Date() } })
        ]);
        res.status(200).json({ status: 200, data: { total, deployed, inStock, faulty, warrantyExpiring } });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/inventory', authenticate, permitMatrix('inventory', 'create'), async (req, res) => {
    try {
        const { name, type, company, division } = req.body;
        if (!name || !type || !company || !division)
            return res.status(200).json({ status: 400, message: 'name, type, company and division are required' });
        const data = await Inventory.create(req.body);
        await log({ req, action: 'INVENTORY_CREATE', resource: 'inventory', resourceId: data._id, after: { name: data.name, type: data.type, company: data.company } });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/inventory/:id', authenticate, permitMatrix('inventory', 'update'), async (req, res) => {
    try {
        const existing = await Inventory.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company edit' });
        const data = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.delete('/inventory/:id', authenticate, permitMatrix('inventory', 'delete'), async (req, res) => {
    try {
        const before = await Inventory.findById(req.params.id).lean();
        if (!before) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && before.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company delete' });
        await Inventory.findByIdAndUpdate(req.params.id, { status: 'deleted', lifecycleStatus: 'retired' });
        await log({ req, action: 'INVENTORY_DELETE', resource: 'inventory', resourceId: req.params.id, before: { name: before?.name, serialNumber: before?.serialNumber, company: before?.company } });
        res.status(200).json({ status: 200, message: 'Retired' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// Legacy type routes
['switch','olt','sfp','bigjclosure','smalljclosure','opticwire','staywire','splitter'].forEach(type => {
    router.get('/all' + type, authenticate, scopeToTenant, async (req, res) => {
        try {
            const query = { status: 'active', type };
            if (req.query.company)  query.company  = req.query.company;
            if (req.query.division) query.division = req.query.division;
            const data = await Inventory.find(query).sort({ createdAt: -1 }).lean();
            res.status(200).json({ status: 200, data });
        } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
    });
    router.post('/' + type, authenticate, permitMatrix('inventory', 'create'), async (req, res) => {
        try {
            const data = await Inventory.create({ ...req.body, type });
            res.status(200).json({ status: 200, data });
        } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
    });
    router.put('/' + type + '/:id', authenticate, permitMatrix('inventory', 'update'), async (req, res) => {
        try {
            const data = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
            res.status(200).json({ status: 200, data });
        } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
    });
});

// ── Categories ──
router.get('/categories', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = { status: 'active' };
        if (req.query.division) query.division = req.query.division;
        if (req.query.company)  query.company  = req.query.company;
        const data = await Category.find(query).sort({ name: 1 });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/categories', authenticate, permitMatrix('inventory', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Category.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/categories/:id', authenticate, permitMatrix('inventory', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Category.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/categories/:id', authenticate, permitMatrix('inventory', 'delete'), async (req, res) => {
    try { await Category.findByIdAndUpdate(req.params.id, { status: 'deleted' }); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Subcategories ──
router.get('/subcategories', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = { status: 'active' };
        if (req.query.categoryId) query.categoryId = req.query.categoryId;
        if (req.query.division)   query.division   = req.query.division;
        if (req.query.company)    query.company    = req.query.company;
        const data = await Subcategory.find(query).sort({ name: 1 });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/subcategories', authenticate, permitMatrix('inventory', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Subcategory.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/subcategories/:id', authenticate, permitMatrix('inventory', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Subcategory.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/subcategories/:id', authenticate, permitMatrix('inventory', 'delete'), async (req, res) => {
    try { await Subcategory.findByIdAndUpdate(req.params.id, { status: 'deleted' }); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Deployment Logs ──
router.get('/deploymentlogs', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = { status: 'active' };
        if (req.query.company)   query.company   = req.query.company;
        if (req.query.division)  query.division  = req.query.division;
        if (req.query.eventType) query.eventType = req.query.eventType;
        if (req.query.itemId)    query.itemId    = req.query.itemId;
        if (req.query.from || req.query.to) {
            query.eventDate = {};
            if (req.query.from) query.eventDate.$gte = new Date(req.query.from);
            if (req.query.to)   query.eventDate.$lte = new Date(req.query.to);
        }
        const data = await DeploymentLog.find(query).sort({ eventDate: -1 }).limit(200);
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/deploymentlogs', authenticate, permitMatrix('inventory', 'create'), async (req, res) => {
    try {
        const saved = await DeploymentLog.create(req.body);
        const newStatus = LIFECYCLE_MAP[req.body.eventType];
        if (newStatus && req.body.itemId) {
            const update = { lifecycleStatus: newStatus };
            if (req.body.condition) update.condition = req.body.condition;
            if (req.body.location?.latlng) update.latlng = req.body.location.latlng;
            await Inventory.findByIdAndUpdate(req.body.itemId, update);
        }
        res.status(200).json({ status: 200, data: saved });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/deploymentlogs/:id', authenticate, permitMatrix('inventory', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await DeploymentLog.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/deploymentlogs/:id', authenticate, permitMatrix('inventory', 'delete'), async (req, res) => {
    try { await DeploymentLog.findByIdAndUpdate(req.params.id, { status: 'deleted' }); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.get('/deploymentlogs/item/:itemId', authenticate, async (req, res) => {
    try { res.status(200).json({ status: 200, data: await DeploymentLog.find({ itemId: req.params.itemId, status: 'active' }).sort({ eventDate: -1 }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Deployment Tasks ──
router.get('/deploymenttasks', authenticate, scopeToTenant, async (req, res) => {
    try { res.status(200).json({ status: 200, data: await DeploymentTask.find(req.query).sort({ createdAt: -1 }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/deploymenttasks', authenticate, permitMatrix('inventory', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await DeploymentTask.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/deploymenttasks/:id', authenticate, permitMatrix('inventory', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await DeploymentTask.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── BOM ──
router.get('/bom', authenticate, async (req, res) => {
    try {
        const query = { status: 'active' };
        if (req.query.project_id) query.project_id = req.query.project_id;
        const data = await BOM.find(query);
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/bom', authenticate, permitMatrix('inventory', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await BOM.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/bom/:id', authenticate, permitMatrix('inventory', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await BOM.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/bom/:id', authenticate, permitMatrix('inventory', 'delete'), async (req, res) => {
    try { await BOM.findByIdAndUpdate(req.params.id, { status: 'deleted' }); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── CSV Export ──
router.get('/inventory/export', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = { status: 'active' };
        if (req.query.company)  query.company  = req.query.company;
        if (req.query.division) query.division = req.query.division;
        const data = await Inventory.find(query).lean();
        const fields = ['name','type','serialNumber','assetTag','company','division','zone','lifecycleStatus','condition','vendor','purchaseCost','warrantyExpiry'];
        const csv = [fields.join(','), ...data.map(row => fields.map(f => JSON.stringify(row[f] ?? '')).join(','))].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=inventory.csv');
        res.send(csv);
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
