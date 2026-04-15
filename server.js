require('dotenv').config();
require('./config/validateEnv');

if (process.env.SENTRY_DSN) {
    require('@sentry/node').init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.2 });
}

const express     = require('express');
const http        = require('http');
const cors        = require('cors');
const bodyParser  = require('body-parser');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const logger      = require('./config/logger');
require('./config/db');

const app    = express();
const server = http.createServer(app);
app.set('trust proxy', 1);

// ── Socket.io ────────────────────────────────────────────────────────────────
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*', credentials: false } });
io.on('connection', socket => {
    socket.on('join', room => socket.join(room));
    socket.on('disconnect', () => {});
});
app.set('io', io);

// ── Security & compression ───────────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc:  ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc:   ["'self'", "'unsafe-inline'"],
            imgSrc:     ["'self'", "data:", "https:", "http:"],
            connectSrc: ["'self'", "ws:", "wss:", "https://cdn.jsdelivr.net"],
        }
    }
}));
app.use(compression());

// ── Request ID ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    req.id = uuidv4();
    res.setHeader('X-Request-Id', req.id);
    next();
});

// ── Metrics & request logging ────────────────────────────────────────────────
const dashboardRouter = require('./routes/dashboard');
const RequestLog      = require('./models/requestlog');
const alertManager    = require('./config/alertManager');

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms      = Date.now() - start;
        const isError = res.statusCode >= 500;
        logger.info({ method: req.method, url: req.url, status: res.statusCode, ms, requestId: req.id });
        dashboardRouter.recordMetric(ms, isError);
        alertManager.record(ms, isError);
        const entry = { method: req.method, url: req.originalUrl, status: res.statusCode, responseTime: ms, timestamp: new Date().toISOString() };
        io.emit('request:log', entry);
        if (!req.originalUrl.startsWith('/dashboard/') && req.originalUrl !== '/health') {
            RequestLog.create({
                method: req.method, url: req.originalUrl, status: res.statusCode,
                responseTime: ms, ip: req.ip || req.headers['x-forwarded-for'] || '—',
                userId: req.user?.id || null, userAgent: req.headers['user-agent'] || '—',
            }).catch(() => {});
        }
    });
    next();
});
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (origin.includes('localhost')) return cb(null, true);
        if (origin.includes('truport.in')) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        console.log("❌ Blocked by CORS:", origin);
        return cb(new Error('CORS blocked: ' + origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── NoSQL injection guard ────────────────────────────────────────────────────
app.use((req, res, next) => {
    function sanitize(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
            if (k.startsWith('$')) delete obj[k];
            else sanitize(obj[k]);
        }
    }
    sanitize(req.query); sanitize(req.body); next();
});

// ── Rate limiting ────────────────────────────────────────────────────────────
const { global: globalLimiter, byRole } = require('./config/rateLimiter');
app.use(globalLimiter);
app.use('/api/v1', (req, res, next) => req.user ? byRole(req, res, next) : next());

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));

// ✅✅✅ ONLY ADDITION (ROOT ROUTE)
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// ── Dashboard & static ───────────────────────────────────────────────────────
app.use('/dashboard', dashboardRouter);
app.use(express.static('public', {
    etag: false, lastModified: false,
    setHeaders: (res, path) => { if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-store'); },
}));

// ── Favicon ───────────────────────────────────────────────────────────────────
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ── Swagger docs ─────────────────────────────────────────────────────────────
const swaggerUi   = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// ── Load route modules once ──────────────────────────────────────────────────
const routeModules = [
    require('./routes/audit'),
    require('./routes/auth'),
    require('./routes/users'),
    require('./routes/customers'),
    require('./routes/companies'),
    require('./routes/inventory'),
    require('./routes/projects'),
    require('./routes/cameras'),
    require('./routes/nvr'),
    require('./routes/contracts'),
    require('./routes/content'),
    require('./routes/uploads'),
    require('./routes/legacy'),
    require('./routes/monitoring'),
    require('./routes/noc'),
    require('./routes/export'),
    require('./routes/fibercores'),
    require('./routes/device-proxy'),
];

for (const mod of routeModules) {
    app.use('/api/v1', mod);
    app.use('/api/v2', mod);
    app.use('/rest/api/latest', mod);
}

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { requestId: req.id, error: err.message, stack: err.stack });
    if (process.env.SENTRY_DSN) require('@sentry/node').captureException(err);
    res.status(500).json({ status: 500, message: 'Internal server error', requestId: req.id });
});

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3010;

server.listen(PORT, () => {
    logger.info(`Server started on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    require('./config/tokenBlacklist').startCleanup();
    require('./config/alertManager').startAlertMonitor();

    const nodemailer = require('nodemailer');
    async function sendCameraAlert(camera) {
        if (!process.env.EMAIL_HOST || !process.env.ALERT_EMAIL) return;
        try {
            const t = nodemailer.createTransport({
                host: process.env.EMAIL_HOST, port: 465, secure: true,
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            });
            await t.sendMail({
                from: process.env.EMAIL_USER, to: process.env.ALERT_EMAIL,
                subject: `🔴 Camera Offline: ${camera.camera_number}`,
                text: `Camera ${camera.camera_number} (${camera.ip_address}) went offline at ${new Date().toISOString()}`,
            });
        } catch (_) {}
    }

    require('./monitoring/camera-monitor').startMonitoring(io, sendCameraAlert);
    require('./monitoring/nvr-monitor').startNvrMonitoring(io);
    require('./noc/sla-rollup').startSlaScheduler();
    require('./noc/sla-escalation').startSlaEscalation(io);

    // SLA breach check every 15 minutes
    setInterval(async () => {
        try {
            const CameraMaintenance = require('./models/cameramaintenance');
            const result = await CameraMaintenance.updateMany(
                { sla_due_at: { $lt: new Date() }, sla_breached: false, status: { $nin: ['resolved','closed'] } },
                { sla_breached: true }
            );
            if (result.modifiedCount > 0) io.emit('camera:sla_breached', { count: result.modifiedCount });
        } catch (_) {}
    }, 15 * 60 * 1000);

    // Keep Railway server warm — ping self every 10 minutes to prevent cold start
    const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
    setInterval(() => {
        require('http').get(`${SERVER_URL}/health`).on('error', () => {});
    }, 10 * 60 * 1000);

    const SessionLog = require('./models/sessionlog');
    setInterval(async () => {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const r = await SessionLog.deleteMany({ loginAt: { $lt: cutoff } }).catch(() => ({ deletedCount: 0 }));
        if (r.deletedCount > 0) logger.info('Session log retention purge', { deleted: r.deletedCount });
    }, 24 * 60 * 60 * 1000);
});

// Audit startup after DB connects
require('mongoose').connection.once('connected', () => {
    dashboardRouter.auditLog(null, 'SERVER_STARTUP',
        `Server started on port ${PORT} — env: ${process.env.NODE_ENV || 'development'}`
    );
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal) {
    logger.info('Shutdown signal received', { signal });
    server.close(() => {
        logger.info('HTTP server closed');
        require('mongoose').connection.close(false, () => {
            logger.info('MongoDB connection closed');
            process.exit(0);
        });
    });
    setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', reason => logger.error('Unhandled rejection', { reason }));
process.on('uncaughtException',  err    => { logger.error('Uncaught exception', { error: err.message }); process.exit(1); });