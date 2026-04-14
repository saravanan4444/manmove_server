const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const Camera   = require('../models/camera');
const CameraStageLog    = require('../models/camerastagelog');
const CameraMaintenance = require('../models/cameramaintenance');
const cameracustomer    = require('../models/cameracustomer');
const { authenticate, scopeToTenant, permit, permitMatrix } = require('../config/authMiddleware');
const { log } = require('../config/auditLog');

const CAMERA_STAGE_ORDER = ['unboxed','cable_pulled','mounted','connected','ip_configured','testing','completed'];

// ── Camera Customers ──
router.get('/cameracustomers', authenticate, scopeToTenant, async (req, res) => {
    try { res.status(200).json({ status: 200, data: await cameracustomer.find(req.query).sort({ created_at: -1 }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/cameracustomers', authenticate, permitMatrix('projects', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await cameracustomer.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/cameracustomers/:id', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await cameracustomer.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/cameracustomers/:id', authenticate, permitMatrix('projects', 'delete'), async (req, res) => {
    try { await cameracustomer.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Cameras CRUD ──
router.get('/cameras', authenticate, scopeToTenant, async (req, res) => {
    try {
        const Pole = require('../models/pole');
        const query = Object.assign({}, req.query);
        const companyFilter = query.company;
        delete query.division; delete query.company;
        const stationFilter = query.station; delete query.station;
        if (query.pole_id)    query.pole_id    = new mongoose.Types.ObjectId(query.pole_id);
        if (query.project_id) query.project_id = new mongoose.Types.ObjectId(query.project_id);
        // Superadmin company filter: resolve via projects
        if (companyFilter && !query.project_id && !query.pole_id) {
            const Project = require('../models/project');
            const projectIds = await Project.find({ company: companyFilter }).distinct('_id');
            query.project_id = { $in: projectIds };
        }
        if (stationFilter) {
            const poleMatch = { police_station: stationFilter };
            if (req.query.project_id) poleMatch.project_id = new mongoose.Types.ObjectId(req.query.project_id);
            const poles = await Pole.find(poleMatch, '_id').lean();
            query.pole_id = { $in: poles.map(p => p._id) };
        }
        const cameras = await Camera.find(query,
            'camera_number camera_type pole_id project_id police_station junction address latitude longitude status current_stage assigned_name ip_address nvr_id nvr_channel lpr_enabled company'
        ).sort({ project_id: 1, status: 1 }).lean();

        // Enrich with pole location data if missing
        const poleIds = [...new Set(cameras.filter(c => c.pole_id && !c.latitude).map(c => c.pole_id.toString()))];
        if (poleIds.length) {
            const poles = await Pole.find({ _id: { $in: poleIds } }, 'police_station junction address latitude longitude').lean();
            const poleMap = Object.fromEntries(poles.map(p => [p._id.toString(), p]));
            cameras.forEach(c => {
                if (c.pole_id && !c.latitude) {
                    const pole = poleMap[c.pole_id.toString()];
                    if (pole) {
                        c.police_station = c.police_station || pole.police_station;
                        c.junction       = c.junction       || pole.junction;
                        c.address        = c.address        || pole.address;
                        c.latitude       = c.latitude       || pole.latitude;
                        c.longitude      = c.longitude      || pole.longitude;
                    }
                }
            });
        }
        res.status(200).json({ status: 200, data: cameras });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/cameras', authenticate, permitMatrix('projects', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Camera.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/cameras/bulk', authenticate, permitMatrix('projects', 'create'), async (req, res) => {
    try {
        const cameras = Array.isArray(req.body) ? req.body : req.body.cameras;
        if (!cameras?.length) return res.status(200).json({ status: 400, message: 'cameras array required' });
        const ops = cameras.map(c => ({
            updateOne: {
                filter: { camera_number: c.camera_number, project_id: c.project_id },
                update: { $setOnInsert: { status: 'not_started', current_stage: 'unboxed', created_at: new Date() }, $set: { pole_id: c.pole_id, police_station: c.police_station, latitude: c.latitude, longitude: c.longitude, camera_type: c.camera_type, company: c.company } },
                upsert: true
            }
        }));
        const result = await Camera.bulkWrite(ops, { ordered: false });
        res.status(200).json({ status: 200, inserted: result.upsertedCount, updated: result.modifiedCount });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/cameras/:id', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await Camera.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/cameras/:id', authenticate, permitMatrix('projects', 'delete'), async (req, res) => {
    try { await Camera.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Camera Stage Update ──
router.post('/camerastages', authenticate, permitMatrix('projects', 'create'), async (req, res) => {
    try {
        const submittedIndex = CAMERA_STAGE_ORDER.indexOf(req.body.stage);
        if (submittedIndex === -1) return res.status(200).json({ status: 400, message: 'Invalid stage' });
        const cam = await Camera.findById(req.body.camera_id);
        if (!cam) return res.status(200).json({ status: 404, message: 'Camera not found' });
        const currentIndex = CAMERA_STAGE_ORDER.indexOf(cam.current_stage);
        const expectedIndex = cam.current_stage === 'not_started' ? 0 : currentIndex + 1;
        if (submittedIndex !== expectedIndex) {
            const expected = cam.current_stage === 'not_started' ? 'unboxed' : (CAMERA_STAGE_ORDER[currentIndex + 1] || 'already_completed');
            return res.status(200).json({ status: 400, message: 'Stage must be "' + expected + '"' });
        }
        const saved = await CameraStageLog.create(req.body);
        await Camera.findByIdAndUpdate(req.body.camera_id, { current_stage: req.body.stage, status: req.body.stage === 'completed' ? 'completed' : 'in_progress' });
        res.status(200).json({ status: 200, data: saved });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/camerastages', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = Object.assign({}, req.query);
        if (query.camera_id)  query.camera_id  = new mongoose.Types.ObjectId(query.camera_id);
        if (query.project_id) query.project_id = new mongoose.Types.ObjectId(query.project_id);
        res.status(200).json({ status: 200, data: await CameraStageLog.find(query).sort({ created_at: -1 }) });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/cameratimeline/:id', authenticate, async (req, res) => {
    try {
        const [logs, camera] = await Promise.all([
            CameraStageLog.find({ camera_id: new mongoose.Types.ObjectId(req.params.id) }).sort({ created_at: 1 }),
            Camera.findById(req.params.id)
        ]);
        res.status(200).json({ status: 200, camera, logs });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Camera Maintenance ──
router.get('/cameramaintenance', authenticate, scopeToTenant, async (req, res) => {
    try {
        const query = Object.assign({}, req.query);
        const companyFilter = query.company;
        delete query.division; delete query.company;
        if (query.camera_id)  query.camera_id  = new mongoose.Types.ObjectId(query.camera_id);
        if (query.project_id) query.project_id = new mongoose.Types.ObjectId(query.project_id);
        if (companyFilter && !query.project_id) {
            const Project = require('../models/project');
            const projectIds = await Project.find({ company: companyFilter }).distinct('_id');
            query.project_id = { $in: projectIds };
        }
        res.status(200).json({ status: 200, data: await CameraMaintenance.find(query).sort({ created_at: -1 }).lean() });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.post('/cameramaintenance', authenticate, permitMatrix('projects', 'create'), async (req, res) => {
    try {
        if (req.body.camera_id) await Camera.findByIdAndUpdate(req.body.camera_id, { status: 'faulty' });
        const data = await CameraMaintenance.create(req.body);
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.put('/cameramaintenance/:id', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try {
        if (req.body.status === 'closed' || req.body.status === 'resolved') {
            req.body.resolved_at = new Date();
            const ticket = await CameraMaintenance.findById(req.params.id);
            if (ticket?.camera_id) await Camera.findByIdAndUpdate(ticket.camera_id, { status: 'completed' });
        }
        res.status(200).json({ status: 200, data: await CameraMaintenance.findByIdAndUpdate(req.params.id, req.body, { new: true }) });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});
router.delete('/cameramaintenance/:id', authenticate, permitMatrix('projects', 'delete'), async (req, res) => {
    try { await CameraMaintenance.findByIdAndDelete(req.params.id); res.status(200).json({ status: 200, message: 'Deleted' }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Camera Dashboard ──
router.get('/cameradashboard', authenticate, scopeToTenant, async (req, res) => {
    try {
        if (!req.query.project_id) return res.status(200).json({ status: 400, message: 'project_id required' });
        const pid = new mongoose.Types.ObjectId(req.query.project_id);
        const [total, completed, in_progress, faulty, open_tickets] = await Promise.all([
            Camera.countDocuments({ project_id: pid }),
            Camera.countDocuments({ project_id: pid, status: 'completed' }),
            Camera.countDocuments({ project_id: pid, status: 'in_progress' }),
            Camera.countDocuments({ project_id: pid, status: 'faulty' }),
            CameraMaintenance.countDocuments({ project_id: pid, status: { $in: ['open','assigned','in_progress'] } })
        ]);
        res.status(200).json({ status: 200, data: { total, completed, in_progress, faulty, open_tickets, percent: total > 0 ? Math.round((completed / total) * 100) : 0 } });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
