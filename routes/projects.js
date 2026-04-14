const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const Project  = require('../models/project');
const Pole     = require('../models/pole');
const Worklog  = require('../models/worklog');
const Material = require('../models/material');
const Expense  = require('../models/expense');
const StationMeta = require('../models/stationmeta');
const SystemLog = require('../models/systemlog');
const { authenticate, scopeToTenant, permit, permitMatrix, SUPERADMIN_ROLES } = require('../config/authMiddleware');
const { log } = require('../config/auditLog');

function syslog(req, action, entity, entity_id, description, status = 'success', error_msg = '') {
    SystemLog.create({
        action, entity,
        entity_id: entity_id ? entity_id.toString() : '',
        description,
        user_name: req.body?.user_name || req.user?.name || '',
        user_id:   req.body?.user_id   || req.user?.id   || '',
        company:   req.body?.company   || req.query?.company || req.user?.company || '',
        ip:        req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '',
        status, error_msg,
    }).catch(() => {});
}

const STAGE_ORDER = ['digging','foundation','pole_installed','cabling_done','camera_installed','testing','completed'];

// ── Projects ──
router.get('/projects', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = Object.assign({}, req.query);
        // keep division filter if explicitly passed, otherwise remove it
        if (!req.query.division) delete query.division;
        const data = await Project.find(query).sort({ total_poles: -1, created_at: -1 }).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/projects', authenticate, scopeToTenant, permitMatrix('projects', 'create'), async (req, res) => {
    try {
        if (!req.body.company) return res.status(200).json({ status: 400, message: 'company is required' });
        // Auto-populate state/district from company if not provided
        if (!req.body.state || !req.body.district) {
            const Company = require('../models/companies');
            const company = await Company.findOne({ name: req.body.company }).lean();
            if (company) {
                if (!req.body.state    && company.state)    req.body.state    = company.state;
                if (!req.body.district && company.district) req.body.district = company.district;
            }
        }
        const data = await Project.create(req.body);
        syslog(req, 'PROJECT_CREATED', 'project', data._id, 'Project "' + data.name + '" created');
        await log({ req, action: 'PROJECT_CREATE', resource: 'projects', resourceId: data._id, after: { name: data.name, company: data.company } });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/projects/:id', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try {
        const existing = await Project.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company edit' });
        res.status(200).json({ status: 200, data: await Project.findByIdAndUpdate(req.params.id, req.body, { new: true }) });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/projects/:id', authenticate, permitMatrix('projects', 'delete'), async (req, res) => {
    try {
        const before = await Project.findById(req.params.id).lean();
        if (!before) return res.status(200).json({ status: 404, message: 'Not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && before.company !== req.user.company)
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company delete' });
        await Project.findByIdAndDelete(req.params.id);
        await log({ req, action: 'PROJECT_DELETE', resource: 'projects', resourceId: req.params.id, before: { name: before?.name, company: before?.company } });
        res.status(200).json({ status: 200, message: 'Deleted' });
    }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Poles ──
router.get('/poles', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = Object.assign({}, req.query);
        const companyFilter = query.company;
        delete query.division; delete query.company;
        if (query.project_id) query.project_id = new mongoose.Types.ObjectId(query.project_id);
        if (query.zone_id)    query.zone_id    = new mongoose.Types.ObjectId(query.zone_id);
        query.status = { $ne: 'deleted' };
        // Superadmin company filter: resolve via projects
        if (companyFilter && !query.project_id) {
            const projectIds = await Project.find({ company: companyFilter }).distinct('_id');
            query.project_id = { $in: projectIds };
        }
        const data = await Pole.find(query,
            'pole_number police_station junction address latitude longitude anpr_count cctv_count status current_stage assigned_name project_id zone_id company created_at'
        ).sort({ project_id: 1, status: 1 }).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/poles', authenticate, permitMatrix('projects', 'create'), async (req, res) => {
    try {
        const data = await Pole.create(req.body);
        syslog(req, 'POLE_CREATED', 'pole', data._id, 'Pole ' + data.pole_number + ' created');
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/poles/:id', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Pole.findByIdAndUpdate(req.params.id, req.body, { new: true, strict: false }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/poles/:id', authenticate, permitMatrix('projects', 'delete'), async (req, res) => {
    try { await Pole.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Worklogs ──
router.get('/worklogs', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = Object.assign({}, req.query);
        const companyFilter = query.company;
        delete query.division; delete query.company;
        if (query.pole_id)    query.pole_id    = new mongoose.Types.ObjectId(query.pole_id);
        if (query.project_id) query.project_id = new mongoose.Types.ObjectId(query.project_id);
        if (companyFilter && !query.project_id) {
            const projectIds = await Project.find({ company: companyFilter }).distinct('_id');
            query.project_id = { $in: projectIds };
        }
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        delete query.limit;
        const data = await Worklog.find(query, 'pole_id project_id stage user_name remarks photo_url latitude longitude created_at')
            .sort({ created_at: -1 }).limit(limit).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/worklogs', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try {
        const submittedStage = req.body.stage;
        const submittedIndex = STAGE_ORDER.indexOf(submittedStage);
        if (submittedIndex === -1) return res.status(200).json({ status: 400, message: 'Invalid stage: ' + submittedStage });
        const pole = await Pole.findById(req.body.pole_id);
        if (!pole) return res.status(200).json({ status: 404, message: 'Pole not found' });
        const currentIndex = STAGE_ORDER.indexOf(pole.current_stage);
        const expectedIndex = pole.current_stage === 'not_started' ? 0 : currentIndex + 1;
        if (submittedIndex !== expectedIndex) {
            const expected = pole.current_stage === 'not_started' ? 'digging' : (STAGE_ORDER[currentIndex + 1] || 'already_completed');
            return res.status(200).json({ status: 400, message: 'Stage must be "' + expected + '". Cannot skip or go back.' });
        }
        const saved = await Worklog.create(req.body);
        const poleStatus = submittedStage === 'completed' ? 'completed' : 'in_progress';
        await Pole.findByIdAndUpdate(req.body.pole_id, { current_stage: submittedStage, status: poleStatus });
        if (submittedStage === 'completed') {
            const totalCost = (pole.civil_cost || 5000) + (pole.pole_cost || 18000) + (pole.cable_cost || 3000) + (pole.labour_cost || 2000);
            await Expense.create({ project_id: pole.project_id, company: pole.company, type: 'pole_completion', amount: totalCost, description: 'Auto: Pole ' + pole.pole_number + ' completed', date: new Date(), added_by: req.body.user_name || 'system' });
            syslog(req, 'POLE_COMPLETED', 'pole', pole._id, 'Pole ' + pole.pole_number + ' completed — ₹' + totalCost);
        }
        // Emit real-time update to project room
        const io = req.app.get('io');
        if (io) io.to('project:' + pole.project_id).emit('pole:update', { pole_id: pole._id, stage: submittedStage, status: poleStatus });
        res.status(200).json({ status: 200, data: saved });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/worklogs/bulk', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    const logs = req.body.logs;
    if (!logs?.length) return res.status(200).json({ status: 400, message: 'No logs provided' });
    let saved = 0; const errors = [];
    await Promise.all(logs.map(async logData => {
        try {
            await Worklog.create(logData);
            saved++;
            const poleStatus = logData.stage === 'completed' ? 'completed' : 'in_progress';
            await Pole.findByIdAndUpdate(logData.pole_id, { current_stage: logData.stage, status: poleStatus });
        } catch (e) { errors.push(e.message); }
    }));
    res.status(200).json({ status: 200, saved, errors });
});

// ── Materials ──
router.get('/materials', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = Object.assign({}, req.query);
        const companyFilter = query.company;
        delete query.division; delete query.company;
        if (query.project_id) query.project_id = new mongoose.Types.ObjectId(query.project_id);
        if (companyFilter && !query.project_id) {
            const projectIds = await Project.find({ company: companyFilter }).distinct('_id');
            query.project_id = { $in: projectIds };
        }
        res.status(200).json({ status: 200, data: await Material.find(query).lean() });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/materials', authenticate, permitMatrix('inventory', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Material.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/materials/:id', authenticate, permitMatrix('inventory', 'update'), async (req, res) => {
    try {
        if (req.body.qty_received !== undefined || req.body.qty_used !== undefined) {
            const mat = await Material.findById(req.params.id);
            if (!mat) return res.status(200).json({ status: 404, message: 'Material not found' });
            const received = req.body.qty_received !== undefined ? req.body.qty_received : mat.qty_received;
            const used     = req.body.qty_used     !== undefined ? req.body.qty_used     : mat.qty_used;
            req.body.balance = received - used;
        }
        res.status(200).json({ status: 200, data: await Material.findByIdAndUpdate(req.params.id, req.body, { new: true }) });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/materials/:id', authenticate, permitMatrix('inventory', 'delete'), async (req, res) => {
    try { await Material.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Expenses ──
router.get('/expenses', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = Object.assign({}, req.query);
        const companyFilter = query.company;
        delete query.division; delete query.company;
        if (query.project_id) query.project_id = new mongoose.Types.ObjectId(query.project_id);
        if (companyFilter && !query.project_id) {
            const projectIds = await Project.find({ company: companyFilter }).distinct('_id');
            query.project_id = { $in: projectIds };
        }
        res.status(200).json({ status: 200, data: await Expense.find(query).sort({ created_at: -1 }).lean() });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/expenses', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Expense.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/expenses/:id', authenticate, permitMatrix('projects', 'delete'), async (req, res) => {
    try { await Expense.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── ANPR Dashboards ──
router.get('/anprdashboard', authenticate, scopeToTenant, async (req, res) => {
    try {
        if (!req.query.project_id) return res.status(200).json({ status: 400, message: 'project_id required' });
        const pid = new mongoose.Types.ObjectId(req.query.project_id);
        const [total, completed, in_progress, not_started, delayed, expenseAgg, project, recent_logs] = await Promise.all([
            Pole.countDocuments({ project_id: pid, status: { $ne: 'deleted' } }),
            Pole.countDocuments({ project_id: pid, status: 'completed' }),
            Pole.countDocuments({ project_id: pid, status: 'in_progress' }),
            Pole.countDocuments({ project_id: pid, status: 'not_started' }),
            Pole.countDocuments({ project_id: pid, status: 'delayed' }),
            Expense.aggregate([{ $match: { project_id: pid } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Project.findById(pid, 'total_poles budget billed_amount'),
            Worklog.find({ project_id: pid }).sort({ created_at: -1 }).limit(10)
        ]);
        const total_cost = expenseAgg.length ? expenseAgg[0].total : 0;
        res.status(200).json({ status: 200, data: { total_poles: total, completed, in_progress, not_started, delayed, progress_percent: total > 0 ? Math.round((completed / total) * 100) : 0, total_cost, budget: project?.budget || 0, billed_amount: project?.billed_amount || 0, profit: (project?.billed_amount || 0) - total_cost, recent_logs } });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/poletimeline/:id', authenticate, scopeToTenant, async (req, res) => {
    try {
        const [logs, pole] = await Promise.all([
            Worklog.find({ pole_id: new mongoose.Types.ObjectId(req.params.id) }).sort({ created_at: 1 }),
            Pole.findById(req.params.id)
        ]);
        res.status(200).json({ status: 200, pole, logs });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/anprdelays', authenticate, scopeToTenant, async (req, res) => {
    try {
        if (!req.query.project_id) return res.status(200).json({ status: 400, message: 'project_id required' });
        const pid = new mongoose.Types.ObjectId(req.query.project_id);
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        const poles = await Pole.find({ project_id: pid, status: { $nin: ['completed','not_started','deleted'] } });
        if (!poles.length) return res.status(200).json({ status: 200, data: [] });
        const latestLogs = await Worklog.aggregate([{ $match: { pole_id: { $in: poles.map(p => p._id) } } }, { $sort: { created_at: -1 } }, { $group: { _id: '$pole_id', last_update: { $first: '$created_at' }, last_stage: { $first: '$stage' } } }]);
        const logMap = {};
        latestLogs.forEach(l => { logMap[l._id.toString()] = l; });
        const delayed = poles.filter(p => { const l = logMap[p._id.toString()]; return !l || new Date(l.last_update) < twoDaysAgo; }).map(p => { const l = logMap[p._id.toString()]; return { _id: p._id, pole_number: p.pole_number, current_stage: p.current_stage, assigned_to: p.assigned_to, last_update: l?.last_update || null, days_stuck: l ? Math.floor((Date.now() - new Date(l.last_update)) / 86400000) : null }; });
        res.status(200).json({ status: 200, data: delayed });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/anprzoneProgress', authenticate, scopeToTenant, async (req, res) => {
    try {
        if (!req.query.project_id) return res.status(200).json({ status: 400, message: 'project_id required' });
        const pid = new mongoose.Types.ObjectId(req.query.project_id);
        const zones = await Pole.aggregate([{ $match: { project_id: pid, status: { $ne: 'deleted' } } }, { $group: { _id: '$zone_id', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } }, in_progress: { $sum: { $cond: [{ $eq: ['$status','in_progress'] }, 1, 0] } }, delayed: { $sum: { $cond: [{ $eq: ['$status','delayed'] }, 1, 0] } } } }]);
        res.status(200).json({ status: 200, data: zones.map(z => ({ ...z, percent: z.total > 0 ? Math.round((z.completed / z.total) * 100) : 0 })) });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Station-wise aggregation ──────────────────────────────────────────────────
router.get('/stations', authenticate, scopeToTenant, async (req, res) => {
    try {
        const match = { status: { $ne: 'deleted' } };
        if (req.query.project_id) {
            match.project_id = new mongoose.Types.ObjectId(req.query.project_id);
        } else if (req.query.company) {
            const projectIds = await Project.find({ company: req.query.company }).distinct('_id');
            match.project_id = { $in: projectIds };
        }
        const [data, metas] = await Promise.all([
            Pole.aggregate([
                { $match: match },
                { $group: {
                    _id: '$police_station',
                    total:          { $sum: 1 },
                    completed:      { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
                    in_progress:    { $sum: { $cond: [{ $eq: ['$status','in_progress'] }, 1, 0] } },
                    anpr_count:     { $sum: { $ifNull: ['$anpr_count', 0] } },
                    cctv_count:     { $sum: { $ifNull: ['$cctv_count', 0] } },
                    completed_anpr: { $sum: { $cond: [{ $eq: ['$status','completed'] }, { $ifNull: ['$anpr_count',0] }, 0] } },
                    completed_cctv: { $sum: { $cond: [{ $eq: ['$status','completed'] }, { $ifNull: ['$cctv_count',0] }, 0] } },
                    lat: { $avg: '$latitude' },
                    lng: { $avg: '$longitude' },
                    company: { $first: '$company' },
                }},
                { $project: { _id:0, name:'$_id', total:1, completed:1, in_progress:1, anpr_count:1, cctv_count:1, completed_anpr:1, completed_cctv:1, lat:1, lng:1, company:1,
                    percent: { $cond: [{ $gt:['$total',0] }, { $multiply:[{ $divide:['$completed','$total'] }, 100] }, 0] } }},
                { $sort: { name: 1 } },
            ]),
            StationMeta.find(req.query.company ? { company: req.query.company } : {}).lean()
        ]);
        // Merge pinned lat/lng and nvr_id from StationMeta
        const metaMap = Object.fromEntries(metas.map(m => [m.name, m]));
        data.forEach(s => {
            const m = metaMap[s.name];
            if (m) {
                if (m.lat && m.lng) { s.lat = m.lat; s.lng = m.lng; s.pinned = true; }
                if (m.nvr_id) s.nvr_id = m.nvr_id;
                if (m.address) s.address = m.address;
            }
        });
        res.json({ status: 200, data });
    } catch (err) { res.json({ status: 500, message: err.message }); }
});

// Pin station location + NVR assignment
router.put('/stations/:name', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try {
        const data = await StationMeta.findOneAndUpdate(
            { name: req.params.name, company: req.body.company || req.user?.company },
            { $set: { lat: req.body.lat, lng: req.body.lng, nvr_id: req.body.nvr_id, address: req.body.address, notes: req.body.notes, project_id: req.body.project_id } },
            { upsert: true, new: true }
        );
        res.json({ status: 200, data });
    } catch (err) { res.json({ status: 500, message: err.message }); }
});

router.get('/stations/:name/poles', authenticate, scopeToTenant, async (req, res) => {
    try {
        const match = { police_station: req.params.name };
        if (req.query.project_id) {
            match.project_id = new mongoose.Types.ObjectId(req.query.project_id);
        } else if (req.query.company) {
            const projectIds = await Project.find({ company: req.query.company }).distinct('_id');
            match.project_id = { $in: projectIds };
        }
        const data = await Pole.find(match).sort({ pole_number: 1 }).lean();
        res.json({ status: 200, data });
    } catch (err) { res.json({ status: 500, message: err.message }); }
});

module.exports = router;
