const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');
const os        = require('os');
const { authenticate, requireSuperadmin } = require('../config/authMiddleware');
const SystemLog = require('../models/systemlog');

const models = {
    adminusers:  require('../models/adminuser'),
    users:       require('../models/userList'),
    customers:   require('../models/customers'),
    inventory:   require('../models/inventory'),
    poles:       require('../models/pole'),
    cameras:     require('../models/camera'),
    projects:    require('../models/project'),
    companies:   require('../models/companies'),
    worklogs:    require('../models/worklog'),
    systemlogs:  SystemLog,
};

const RequestLog = require('../models/requestlog');

// ── Audit helper — write every dashboard action to SystemLog ─────────────────
async function auditLog(req, action, description, status = 'success') {
    try {
        await SystemLog.create({
            action,
            entity:      'dashboard',
            description,
            user_name:   req?.user?.name  || 'system',
            user_id:     req?.user?.id    || null,
            company:     req?.user?.company || 'system',
            ip:          req?.ip || req?.headers?.['x-forwarded-for'] || '—',
            status,
        });
    } catch (_) { /* never block the response */ }
}
router.auditLog = auditLog; // expose for server.js startup log

// Rolling metrics store (in-memory, last 20 data points)
const METRICS_WINDOW = 20;
const metrics = { memory: [], requests: [], responseTimes: [], labels: [] };
let totalRequests = 0, totalErrors = 0;

function pushMetric(label, mem, requests, ema) {
    metrics.memory.push(mem);
    metrics.requests.push(requests);
    metrics.responseTimes.push(ema);
    metrics.labels.push(label);
    if (metrics.memory.length > METRICS_WINDOW) {
        metrics.memory.shift(); metrics.requests.shift();
        metrics.responseTimes.shift(); metrics.labels.shift();
    }
}

// Seed initial memory snapshots every 30s even with no traffic
setInterval(() => {
    pushMetric(
        new Date().toLocaleTimeString('en-IN', { hour12: false }),
        Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        totalRequests, 0
    );
}, 30000);

// Called from server.js on each request
router.recordMetric = (ms, isError) => {
    totalRequests++;
    if (isError) totalErrors++;
    const lastEma = metrics.responseTimes[metrics.responseTimes.length - 1] || 0;
    pushMetric(
        new Date().toLocaleTimeString('en-IN', { hour12: false }),
        Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        totalRequests,
        Math.round(lastEma * 0.8 + ms * 0.2)
    );
};

router.get('/stats', authenticate, requireSuperadmin, (req, res) => {
    const mem = process.memoryUsage();
    const { p95, getWindow } = require('../config/alertManager');
    const win = getWindow();
    res.json({
        status:       'ok',
        uptime:       Math.floor(process.uptime()),
        nodeVersion:  process.version,
        platform:     process.platform,
        arch:         process.arch,
        pid:          process.pid,
        mongoStatus:  mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        mongoHost:    mongoose.connection.host || '—',
        memoryMB:     Math.round(mem.rss / 1024 / 1024),
        heapUsedMB:   Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB:  Math.round(mem.heapTotal / 1024 / 1024),
        cpuLoad:      os.loadavg()[0].toFixed(2),
        cpuCores:     os.cpus().length,
        totalMemGB:   (os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
        freeMemGB:    (os.freemem() / 1024 / 1024 / 1024).toFixed(1),
        hostname:     os.hostname(),
        totalRequests,
        totalErrors,
        p95ResponseMs: p95(win.responseTimes),
        errorRate:     win.requests > 0 ? ((win.errors / win.requests) * 100).toFixed(1) : '0.0',
        env:          process.env.NODE_ENV || 'development',
        serverTime:   new Date().toISOString(),
    });
});

router.get('/metrics', authenticate, requireSuperadmin, (req, res) => {
    const history = metrics.labels.map((time, i) => ({
        time,
        memoryMB:        metrics.memory[i],
        avgResponseTime: metrics.responseTimes[i],
        requests:        metrics.requests[i]
    }));
    res.json({ status: 'ok', data: { history, totalRequests, totalErrors } });
});

router.get('/dbstats', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const counts = {};
        await Promise.all(Object.entries(models).map(async ([name, model]) => {
            counts[name] = await model.countDocuments({});
        }));
        const start = Date.now();
        await mongoose.connection.db.admin().ping();
        const pingMs = Date.now() - start;
        const dbStats = await mongoose.connection.db.stats();
        const serverStatus = await mongoose.connection.db.admin().serverStatus();
        res.json({
            status: 'ok',
            collections: counts,
            pingMs,
            dbName:        mongoose.connection.name,
            host:          mongoose.connection.host,
            port:          mongoose.connection.port,
            storageMB:     Math.round(dbStats.storageSize / 1024 / 1024),
            dataMB:        Math.round(dbStats.dataSize / 1024 / 1024),
            totalDocs:     Object.values(counts).reduce((a, b) => a + b, 0),
            connections:   serverStatus.connections,
        });
    } catch (err) { res.json({ status: 'error', message: err.message }); }
});

router.get('/logs', authenticate, requireSuperadmin, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const data = await SystemLog.find({}).sort({ created_at: -1 }).limit(50).lean();
        res.json({ status: 'ok', data });
    } catch (err) { res.json({ status: 'error', message: err.message }); }
});

router.post('/logs/clear', authenticate, requireSuperadmin, async (req, res) => {
    try {
        await SystemLog.deleteMany({});
        await auditLog(req, 'DASHBOARD_LOGS_CLEARED', 'System activity logs cleared by admin');
        res.json({ status: 'ok', message: 'Logs cleared' });
    } catch (err) { res.json({ status: 'error', message: err.message }); }
});

router.get('/errors', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const data = await SystemLog.find({ status: 'error' }).sort({ created_at: -1 }).limit(30).lean();
        res.json({ status: 'ok', data });
    } catch (err) { res.json({ status: 'error', message: err.message }); }
});

router.get('/routes', authenticate, requireSuperadmin, (req, res) => {
    const routes = [];
    const seen = new Set();
    function extractRoutes(stack, prefix) {
        stack.forEach(layer => {
            if (layer.route) {
                const method = Object.keys(layer.route.methods)[0].toUpperCase();
                const path = (prefix || '') + layer.route.path;
                const key = method + path;
                if (!seen.has(key)) { seen.add(key); routes.push({ method, path }); }
            } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
                const prefix2 = layer.regexp.source
                    .replace('\\/?', '').replace('(?=\\/|$)', '')
                    .replace(/\\\//g, '/').replace(/\^/g, '').replace(/\$/g, '');
                extractRoutes(layer.handle.stack, prefix2 === '(?:)' ? (prefix || '') : prefix2);
            }
        });
    }
    extractRoutes(req.app._router.stack, '');
    routes.sort((a, b) => a.path.localeCompare(b.path));
    res.json({ status: 'ok', routes, total: routes.length });
});

// Seed endpoints
router.post('/seed/superadmin', authenticate, requireSuperadmin, async (req, res) => {
    if (process.env.NODE_ENV === 'production')
        return res.status(403).json({ status: 403, message: 'Seeding disabled in production' });
    try {
        const adminuser = require('../models/adminuser');
        const bcrypt = require('bcrypt');
        const exists = await adminuser.findOne({ email: 'admin@manmove.com' });
        if (exists) return res.json({ status: 200, message: 'Superadmin already exists' });
        await adminuser.create({ name: 'Super Admin', email: 'admin@manmove.com', password: await bcrypt.hash('Admin@123', 12), role: 'superadmin', company: 'ManMove Networks', division: ['isp','camera','anpr'], status: 'active' });
        await auditLog(req, 'DASHBOARD_SEED_SUPERADMIN', 'Superadmin account seeded via dashboard');
        res.json({ status: 200, message: 'Superadmin created — admin@manmove.com / Admin@123' });
    } catch (err) { res.json({ status: 500, message: err.message }); }
});

router.post('/seed/roles', authenticate, requireSuperadmin, async (req, res) => {
    if (process.env.NODE_ENV === 'production')
        return res.status(403).json({ status: 403, message: 'Seeding disabled in production' });
    try {
        const roles = require('../models/roles');
        const defaults = [
            { name: 'superadmin', pages: [], actions: { create: true, update: true, delete: true, assign: true }, division: ['isp','camera','anpr'] },
            { name: 'om',         pages: ['dashboard','anprdashboard','anprprojects','anprpoles','anprcameras','anprworklogs','anprmaterials','anprexpenses','anprmaintenance','anprsystemlogs','nvrdashboard','nvrlist','noc','nms','inventory','deployments','threads','locate','contracts','workorders'], actions: { create: true, update: true, delete: false, assign: true }, division: ['isp','camera','anpr'] },
            { name: 'pi',         pages: ['dashboard','ispdashboard','leads','feasibility','postfeasibility','pandc','customers','olts','threads','locate'], actions: { create: true, update: true, delete: false, assign: false }, division: ['isp'] },
            { name: 'cc',         pages: ['dashboard','ispdashboard','customers','threads'], actions: { create: false, update: true, delete: false, assign: false }, division: ['isp'] },
        ];
        let created = 0;
        for (const r of defaults) {
            const ex = await roles.findOne({ name: r.name });
            if (!ex) { await roles.create(r); created++; }
        }
        await auditLog(req, 'DASHBOARD_SEED_ROLES', `${created} default roles seeded via dashboard`);
        res.json({ status: 200, message: created + ' roles created' });
    } catch (err) { res.json({ status: 500, message: err.message }); }
});

router.get('/health', authenticate, requireSuperadmin, async (req, res) => {
    const mem = process.memoryUsage();
    const { p95, getWindow } = require('../config/alertManager');
    const win = getWindow();
    // MongoDB check
    let mongoStatus = 'disconnected', mongoPingMs = null;
    try {
        const start = Date.now();
        await mongoose.connection.db.admin().ping();
        mongoPingMs = Date.now() - start;
        mongoStatus = 'connected';
    } catch (_) {}
    // Redis check
    const redisStatus = process.env.REDIS_URL ? 'configured' : 'not configured';
    // Email check
    const emailStatus = process.env.EMAIL_HOST && process.env.EMAIL_USER ? 'configured' : 'not configured';
    // Memory %
    const heapPct  = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    const rssPct   = Math.round((mem.rss / os.totalmem()) * 100);
    const ramUsed  = os.totalmem() - os.freemem();
    const ramPct   = Math.round((ramUsed / os.totalmem()) * 100);
    const p95ms    = p95(win.responseTimes);
    const errRate  = win.requests > 0 ? ((win.errors / win.requests) * 100) : 0;
    const overall  = mongoStatus === 'connected' && heapPct < 90 && errRate < 10 ? 'ok' : 'degraded';
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        status: overall,
        uptime: Math.floor(process.uptime()),
        env:    process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid:    process.pid,
        hostname: os.hostname(),
        checks: {
            mongodb: { status: mongoStatus, pingMs: mongoPingMs },
            redis:   { status: redisStatus },
            email:   { status: emailStatus },
        },
        memory: {
            rssMB:      Math.round(mem.rss / 1024 / 1024),
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB:Math.round(mem.heapTotal / 1024 / 1024),
            heapPct,
            rssPct,
            systemTotalGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
            systemFreeGB:  (os.freemem() / 1024 / 1024 / 1024).toFixed(1),
            systemUsedPct: ramPct,
        },
        performance: {
            p95ResponseMs: p95ms,
            errorRate:     errRate.toFixed(1),
            totalRequests: win.requests,
            windowSecs:    60,
        },
    });
});

router.get('/requestlogs', authenticate, requireSuperadmin, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const data = await RequestLog.find({}).sort({ timestamp: -1 }).limit(100).lean();
        res.json({ status: 'ok', data });
    } catch (err) { res.json({ status: 'error', message: err.message }); }
});

router.post('/restart', authenticate, requireSuperadmin, async (req, res) => {
    await auditLog(req, 'SERVER_RESTART', `Server restart triggered by ${req.user?.name || 'admin'} (${req.user?.email || '—'})`);
    res.json({ status: 'ok', message: 'Server restarting...' });
    setTimeout(() => {
        // SIGUSR2 = nodemon's own restart signal (works in dev)
        // process.exit(0) = Railway restarts via restartPolicyType=always (works in prod)
        if (process.env.NODE_ENV !== 'production') {
            process.kill(process.pid, 'SIGUSR2');
        } else {
            process.exit(0);
        }
    }, 1500);
});

module.exports = router;
