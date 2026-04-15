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
// mytickets must be BEFORE /:id routes
router.get('/cameramaintenance/mytickets', authenticate, async (req, res) => {
    try {
        const data = await CameraMaintenance.find({
            assigned_to: req.user?._id || req.user?.id,
            status: { $in: ['open','assigned','in_progress'] }
        }).sort({ priority: 1, created_at: -1 }).lean();
        const camIds = data.map(t => t.camera_id).filter(Boolean);
        const cameras = await Camera.find({ _id: { $in: camIds } }, 'camera_number ip_address latitude longitude location').lean();
        const camMap = Object.fromEntries(cameras.map(c => [c._id.toString(), c]));
        res.status(200).json({ status: 200, data: data.map(t => ({ ...t, camera: camMap[t.camera_id?.toString()] || null })) });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

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

        // Repeat fault detection
        let fault_count_30d = 1, is_chronic = false;
        if (req.body.camera_id) {
            const since = new Date(Date.now() - 30 * 86400000);
            fault_count_30d = await CameraMaintenance.countDocuments({ camera_id: req.body.camera_id, created_at: { $gte: since } }) + 1;
            is_chronic = fault_count_30d >= 3;
        }

        // SLA: critical=4h, high=8h, medium=24h, low=48h
        const SLA_MAP = { critical: 4, high: 8, medium: 24, low: 48 };

        // ── AI: Auto-classify fault + suggest priority ────────────────────
        let ai_classification = null;
        if (req.body.description) {
            const { classifyFault } = require('../monitoring/ai-engine');
            ai_classification = classifyFault(req.body.description);
        }

        // Use AI suggestions if not manually provided
        const fault_type = req.body.fault_type || ai_classification?.fault_type || 'Other';
        const priority   = req.body.priority   || ai_classification?.priority   || 'medium';

        const sla_hours  = SLA_MAP[priority] || 24;
        const sla_due_at = new Date(Date.now() + sla_hours * 3600000);

        const data = await CameraMaintenance.create({
            ...req.body, fault_type, priority, fault_count_30d, is_chronic, sla_hours, sla_due_at,
            ai_classification,
        });

        const io = req.app.get('io');
        if (io) io.emit('camera:fault_raised', { ticket_id: data._id, fault_type, priority, is_chronic, sla_due_at, ai_classification });

        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/cameramaintenance/:id', authenticate, permitMatrix('projects', 'update'), async (req, res) => {
    try {
        // Require after_photo_url to close a ticket
        if ((req.body.status === 'closed' || req.body.status === 'resolved') && !req.body.after_photo_url) {
            const existing = await CameraMaintenance.findById(req.params.id, 'after_photo_url').lean();
            if (!existing?.after_photo_url)
                return res.status(200).json({ status: 400, message: 'After-service photo required to close ticket' });
        }
        if (req.body.status === 'closed' || req.body.status === 'resolved') {
            req.body.resolved_at = new Date();
            const ticket = await CameraMaintenance.findById(req.params.id);
            if (ticket?.camera_id) await Camera.findByIdAndUpdate(ticket.camera_id, { status: 'completed' });
        }

        // Auto-check SLA breach
        const ticket = await CameraMaintenance.findById(req.params.id, 'sla_due_at resolved_at').lean();
        if (ticket?.sla_due_at && !req.body.resolved_at && new Date() > new Date(ticket.sla_due_at))
            req.body.sla_breached = true;

        const data = await CameraMaintenance.findByIdAndUpdate(req.params.id, req.body, { new: true });

        // Push notification on assign
        const io = req.app.get('io');
        if (req.body.assigned_to && io) {
            io.emit('camera:ticket_assigned', {
                ticket_id: data._id, fault_type: data.fault_type,
                assigned_to: req.body.assigned_to, assigned_name: req.body.assigned_name,
                sla_due_at: data.sla_due_at, priority: data.priority,
            });
            // Email notification
            if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
                const nodemailer = require('nodemailer');
                const t = nodemailer.createTransport({
                    host: process.env.EMAIL_HOST, port: 465, secure: true,
                    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                });
                t.sendMail({
                    from: process.env.EMAIL_USER,
                    to: process.env.ALERT_EMAIL,
                    subject: `🔧 Ticket Assigned: ${data.fault_type} [${data.priority?.toUpperCase()}]`,
                    text: `Ticket assigned to ${req.body.assigned_name}.\nFault: ${data.fault_type}\nPriority: ${data.priority}\nSLA Due: ${data.sla_due_at}\nDescription: ${data.description}`,
                }).catch(() => {});
            }
        }

        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Checklist update (field staff diagnostic) ─────────────────────────────
router.put('/cameramaintenance/:id/checklist', authenticate, async (req, res) => {
    try {
        const { pingHost } = require('../monitoring/ping');
        const { checkRtsp } = require('../monitoring/rtsp-check');
        const ticket = await CameraMaintenance.findById(req.params.id).lean();
        const camera = ticket?.camera_id ? await Camera.findById(ticket.camera_id, 'ip_address rtsp_port').lean() : null;

        // Auto-run ping + RTSP checks if camera has IP
        const autoChecks = {};
        if (camera?.ip_address) {
            const ping = await pingHost(camera.ip_address, 3000);
            autoChecks.ping_ok = ping.alive;
            if (ping.alive) {
                const rtsp = await checkRtsp(camera.ip_address, camera.rtsp_port || 554);
                autoChecks.rtsp_ok = rtsp.alive;
            }
        }

        const checklist = { ...req.body, ...autoChecks };
        const data = await CameraMaintenance.findByIdAndUpdate(req.params.id, { checklist }, { new: true });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── SLA breach auto-check (called by cron every 15 min) ──────────────────
router.post('/cameramaintenance/sla/check', authenticate, async (req, res) => {
    try {
        const now = new Date();
        const result = await CameraMaintenance.updateMany(
            { sla_due_at: { $lt: now }, sla_breached: false, status: { $nin: ['resolved','closed'] } },
            { sla_breached: true }
        );
        const io = req.app.get('io');
        if (io && result.modifiedCount > 0) io.emit('camera:sla_breached', { count: result.modifiedCount });
        res.status(200).json({ status: 200, breached: result.modifiedCount });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Client Service Report (printable HTML) ───────────────────────────────
router.get('/cameramaintenance/:id/report', authenticate, async (req, res) => {
    try {
        const ticket = await CameraMaintenance.findById(req.params.id).lean();
        if (!ticket) return res.status(404).send('Ticket not found');
        const camera = ticket.camera_id ? await Camera.findById(ticket.camera_id, 'camera_number ip_address location brand model').lean() : null;

        const cl = ticket.checklist || {};
        const checkRow = (label, val) => `<tr><td>${label}</td><td style="color:${val===true?'green':val===false?'red':'#888'}">${val===true?'✅ Pass':val===false?'❌ Fail':'—'}</td></tr>`;
        const slaStatus = ticket.sla_breached ? '<span style="color:red;font-weight:700">⚠ SLA BREACHED</span>' : '<span style="color:green;font-weight:700">✅ Within SLA</span>';

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Service Report — ${ticket.fault_type || 'Fault'}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:800px;margin:0 auto}
  h1{font-size:22px;margin-bottom:4px} .sub{color:#888;font-size:13px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th,td{padding:9px 12px;border:1px solid #ddd;text-align:left;font-size:13px}
  th{background:#f5f5f5;font-weight:600} .badge{padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;color:#fff}
  .photos{display:flex;gap:16px;margin-bottom:20px} .photos img{width:48%;border-radius:8px;border:1px solid #ddd}
  .footer{margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
  @media print{body{padding:16px}}
</style></head><body>
<h1>📷 Camera Service Report</h1>
<div class="sub">Generated: ${new Date().toLocaleString('en-IN')}</div>

<table>
  <tr><th colspan="2">Ticket Details</th></tr>
  <tr><td>Ticket ID</td><td>${ticket._id}</td></tr>
  <tr><td>Fault Type</td><td>${ticket.fault_type || '—'}</td></tr>
  <tr><td>Priority</td><td><span class="badge" style="background:${ticket.priority==='critical'||ticket.priority==='high'?'#ff4560':ticket.priority==='medium'?'#feb019':'#00a854'}">${(ticket.priority||'').toUpperCase()}</span></td></tr>
  <tr><td>Description</td><td>${ticket.description || '—'}</td></tr>
  <tr><td>Status</td><td>${ticket.status || '—'}</td></tr>
  <tr><td>SLA</td><td>${slaStatus} &nbsp; Due: ${ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString('en-IN') : '—'}</td></tr>
  <tr><td>Reported</td><td>${ticket.created_at ? new Date(ticket.created_at).toLocaleString('en-IN') : '—'}</td></tr>
  <tr><td>Resolved</td><td>${ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString('en-IN') : 'Not yet resolved'}</td></tr>
  ${ticket.resolved_at && ticket.created_at ? `<tr><td>Resolution Time</td><td>${Math.round((new Date(ticket.resolved_at)-new Date(ticket.created_at))/3600000)} hours</td></tr>` : ''}
</table>

${camera ? `<table>
  <tr><th colspan="2">Camera Details</th></tr>
  <tr><td>Camera Number</td><td>${camera.camera_number||'—'}</td></tr>
  <tr><td>Brand / Model</td><td>${camera.brand||'—'} ${camera.model||''}</td></tr>
  <tr><td>IP Address</td><td>${camera.ip_address||'—'}</td></tr>
  <tr><td>Location</td><td>${camera.location||'—'}</td></tr>
</table>` : ''}

<table>
  <tr><th colspan="2">Diagnostic Checklist</th></tr>
  ${checkRow('Power Supply OK', cl.power_ok)}
  ${checkRow('PoE Switch Port Active', cl.poe_ok)}
  ${checkRow('Cable Continuity OK', cl.cable_ok)}
  ${checkRow('IP Reachable (Ping)', cl.ping_ok)}
  ${checkRow('RTSP Stream Responding', cl.rtsp_ok)}
  ${checkRow('Camera Web UI Accessible', cl.webui_ok)}
  ${checkRow('NVR Channel Assigned', cl.nvr_channel_ok)}
  ${checkRow('No Physical Damage', cl.physical_ok)}
</table>

<table>
  <tr><th colspan="2">Resolution</th></tr>
  <tr><td>Resolution Type</td><td>${ticket.resolution_type || '—'}</td></tr>
  <tr><td>Engineer</td><td>${ticket.assigned_name || ticket.resolved_by || '—'}</td></tr>
  <tr><td>Notes</td><td>${ticket.resolution || '—'}</td></tr>
  <tr><td>AMC Covered</td><td>${ticket.amc_covered ? '✅ Yes — ' + (ticket.amc_type||'') : '❌ No'}</td></tr>
  ${ticket.is_chronic ? '<tr><td>Chronic Fault</td><td style="color:red;font-weight:700">⚠ Yes — '+ticket.fault_count_30d+' faults in 30 days</td></tr>' : ''}
</table>

${(ticket.before_photo_url || ticket.after_photo_url) ? `
<div style="font-weight:600;font-size:14px;margin-bottom:10px">Service Photos</div>
<div class="photos">
  ${ticket.before_photo_url ? `<div><div style="font-size:12px;color:#888;margin-bottom:4px">Before</div><img src="${ticket.before_photo_url}"></div>` : ''}
  ${ticket.after_photo_url  ? `<div><div style="font-size:12px;color:#888;margin-bottom:4px">After</div><img src="${ticket.after_photo_url}"></div>`  : ''}
</div>` : ''}

<div class="footer">This report was generated by ManMove NOC · ${new Date().toLocaleDateString('en-IN')}</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) { res.status(500).send('Report generation failed'); }
});
router.get('/cameraamc', authenticate, scopeToTenant, async (req, res) => {
    try {
        const now = new Date();
        const in30 = new Date(Date.now() + 30 * 86400000);
        const { project_id } = req.query;
        const filter = { amc_type: { $ne: 'none' } };
        if (project_id) filter.project_id = new mongoose.Types.ObjectId(project_id);

        const tickets = await CameraMaintenance.find(filter, 'camera_id amc_start amc_end amc_type amc_covered company project_id')
            .sort({ amc_end: 1 }).lean();

        // Deduplicate by camera_id — keep latest AMC record per camera
        const seen = new Set();
        const unique = tickets.filter(t => {
            const k = t.camera_id?.toString();
            if (!k || seen.has(k)) return false;
            seen.add(k); return true;
        });

        const data = unique.map(t => ({
            ...t,
            amc_status: !t.amc_end ? 'unknown'
                : new Date(t.amc_end) < now ? 'expired'
                : new Date(t.amc_end) < in30 ? 'expiring_soon'
                : 'active',
        }));

        res.status(200).json({ status: 200, data });
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
