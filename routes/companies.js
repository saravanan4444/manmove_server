const express   = require('express');
const router    = express.Router();
const companies = require('../models/companies');
const zones     = require('../models/zones');
const adminuser = require('../models/adminuser');
const userList  = require('../models/userList');
const Project   = require('../models/project');
const SystemLog = require('../models/systemlog');
const roles     = require('../models/roles');
const { getDefaultRoles } = require('../config/defaultRoles');
const { authenticate, requireSuperadmin, scopeToTenant, permit, permitMatrix } = require('../config/authMiddleware');
const { log } = require('../config/auditLog');

// ── Companies — SuperAdmin only for write operations ──
router.get('/companies', authenticate, async (req, res) => {
    try {
        // non-superadmin can only see their own company
        const query = req.user.role === 'superadmin' || req.user.role === 'administrator'
            ? req.query
            : { name: req.user.company };
        res.status(200).json({ status: 200, data: await companies.find(query) });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/companies', authenticate, requireSuperadmin, async (req, res) => {
    try {
        // ── Duplicate check ───────────────────────────────────────────────
        const exists = await companies.findOne({ name: new RegExp('^' + req.body.name + '$', 'i') });
        if (exists) return res.status(200).json({ status: 400, message: `Company "${req.body.name}" already exists` });

        const doc = await companies.create(req.body);
        await log({ req, action: 'COMPANY_CREATE', resource: 'companies', resourceId: doc._id, after: req.body });

        // Auto-seed default roles for this company (skip if already exist)
        const divisions = req.body.divisions || { isp: true };
        const defaultRoles = getDefaultRoles(doc.name, divisions);
        for (const role of defaultRoles) {
            const exists = await roles.findOne({ name: role.name, company: doc.name });
            if (!exists) await roles.create(role);
        }

        res.status(200).json({ status: 200, data: doc });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/companies/:id', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const before = await companies.findById(req.params.id).lean();
        const doc    = await companies.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await log({ req, action: 'COMPANY_UPDATE', resource: 'companies', resourceId: req.params.id, before, after: req.body });
        res.status(200).json({ status: 200, data: doc });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Seed default roles for an existing company (SuperAdmin only) ──
router.post('/companies/:id/seed-roles', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const company = await companies.findById(req.params.id).lean();
        if (!company) return res.status(200).json({ status: 404, message: 'Company not found' });
        const divisions = company.divisions || { isp: true };
        const defaultRoles = getDefaultRoles(company.name, divisions);
        let created = 0, skipped = 0;
        for (const role of defaultRoles) {
            const exists = await roles.findOne({ name: role.name, company: company.name });
            if (!exists) { await roles.create(role); created++; } else skipped++;
        }
        res.status(200).json({ status: 200, message: `${created} roles created, ${skipped} already existed` });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/companies/:id', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const before = await companies.findById(req.params.id).lean();
        await companies.findByIdAndDelete(req.params.id);
        await log({ req, action: 'COMPANY_DELETE', resource: 'companies', resourceId: req.params.id, before });
        res.status(200).json({ status: 200, message: 'Deleted' });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Zones — scoped to tenant ──
router.get('/zones', authenticate, scopeToTenant, async (req, res) => {
    try { res.status(200).json({ status: 200, data: await zones.find(req.query) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/zones', authenticate, scopeToTenant, permitMatrix('leads', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await zones.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/zones/:id', authenticate, scopeToTenant, permitMatrix('leads', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await zones.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/zones/:id', authenticate, permitMatrix('leads', 'delete'), async (req, res) => {
    try { await zones.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Platform Stats (superadmin only) ──
router.get('/platformstats', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const now = new Date();
        const months = [], monthRanges = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }));
            monthRanges.push({ start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) });
        }
        const days = [], dayRanges = [];
        for (let j = 6; j >= 0; j--) {
            const day = new Date(now); day.setDate(day.getDate() - j);
            days.push(day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
            const s = new Date(day); s.setHours(0,0,0,0);
            const e = new Date(day); e.setHours(23,59,59,999);
            dayRanges.push({ start: s, end: e });
        }
        const [totalCompanies, totalAdmins, totalUsers, totalProjects, companyList, recentLogs, growth, healthSuccess, healthErrors] = await Promise.all([
            companies.countDocuments({}),
            adminuser.countDocuments({}),
            userList.countDocuments({}),
            Project.countDocuments({}),
            companies.find({}, 'name email mobile address divisions status createdAt').lean(),
            SystemLog.find({}).sort({ created_at: -1 }).limit(10).lean(),
            Promise.all(monthRanges.map(r => companies.countDocuments({ createdAt: { $gte: r.start, $lte: r.end } }))),
            Promise.all(dayRanges.map(r => SystemLog.countDocuments({ status: 'success', created_at: { $gte: r.start, $lte: r.end } }))),
            Promise.all(dayRanges.map(r => SystemLog.countDocuments({ status: 'error', created_at: { $gte: r.start, $lte: r.end } }))),
        ]);
        const divCount = { isp: 0, camera: 0, anpr: 0 };
        companyList.forEach(c => { if (c.divisions) { if (c.divisions.isp) divCount.isp++; if (c.divisions.camera) divCount.camera++; if (c.divisions.anpr) divCount.anpr++; } });
        const enriched = await Promise.all(companyList.map(async c => ({ ...c, adminCount: await adminuser.countDocuments({ company: c.name }) })));
        res.status(200).json({ status: 200, totalCompanies, totalAdminUsers: totalAdmins, totalFieldUsers: totalUsers, totalProjects, companies: enriched, recentLogs, charts: { growth: { labels: months, data: growth }, health: { labels: days, success: healthSuccess, errors: healthErrors }, divisions: { labels: ['ISP','Camera','ANPR'], data: [divCount.isp, divCount.camera, divCount.anpr] } } });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/companydetail/:name', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const name = req.params.name;
        const [adminUsers, fieldUsers, projects, lastActivity] = await Promise.all([
            adminuser.find({ company: name }, 'name email role').lean(),
            userList.countDocuments({ company: name }),
            Project.find({ company: name }, 'name total_poles status budget billed_amount start_date end_date').lean(),
            SystemLog.findOne({ company: name }).sort({ created_at: -1 }).lean(),
        ]);
        res.status(200).json({ status: 200, adminUsers, fieldUsers, projects, lastActivity: lastActivity?.created_at || null });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Dashboard Count ──
router.get('/dashcount', authenticate, async (req, res) => {
    try {
        const Product   = require('../models/product');
        const customers = require('../models/customers');
        const isSuperAdmin = ['superadmin','administrator'].includes(req.user.role);
        const company   = isSuperAdmin ? req.query.company : req.user.company;
        const period    = req.query.period || 'week';
        const query     = company ? { company } : {};
        const now = new Date();
        const labels = [], dateRanges = [];
        if (period === 'week') {
            for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' })); const s = new Date(d); s.setHours(0,0,0,0); const e = new Date(d); e.setHours(23,59,59,999); dateRanges.push({ start: s, end: e }); }
        } else if (period === 'month') {
            for (let i = 3; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i * 7); labels.push('W' + (4 - i)); const s = new Date(d); s.setDate(s.getDate() - 6); s.setHours(0,0,0,0); const e = new Date(d); e.setHours(23,59,59,999); dateRanges.push({ start: s, end: e }); }
        } else {
            for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); labels.push(d.toLocaleDateString('en-IN', { month: 'short' })); dateRanges.push({ start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }); }
        }
        const [leads, custs] = await Promise.all([Product.countDocuments(query), customers.countDocuments(query)]);
        const [leadsChart, custsChart] = await Promise.all([
            Promise.all(dateRanges.map(r => Product.countDocuments({ ...query, created_at: { $gte: r.start, $lte: r.end } }))),
            Promise.all(dateRanges.map(r => customers.countDocuments({ ...query, created_at: { $gte: r.start, $lte: r.end } })))
        ]);
        res.status(200).json({ status: 200, leads, customers: custs, chart: { labels, leads: leadsChart, customers: custsChart } });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
