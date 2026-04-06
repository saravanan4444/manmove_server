const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const Joi      = require('joi');
const { login: loginLimiter } = require('../config/rateLimiter');
const adminuser = require('../models/adminuser');
const userList  = require('../models/userList');
const roles     = require('../models/roles');
const { authenticate, permit, requireSuperadmin, scopeToTenant, signToken, SECRET, REFRESH_SECRET, SUPERADMIN_ROLES } = require('../config/authMiddleware');
const { log } = require('../config/auditLog');
const permissionCache = require('../config/permissionCache');
const { recordLogin, recordLogout } = require('../config/sessionTracker');

const SALT_ROUNDS = 12;

const loginSchema = Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
}).unknown(true);

const userLoginSchema = Joi.object({
    empId:    Joi.string().required(),
    password: Joi.string().required()
}).unknown(true);

// Admin login
/**
 * @swagger
 * /adminlogin:
 *   post:
 *     tags: [Auth]
 *     summary: Admin login
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: admin@manmove.com }
 *               password: { type: string, example: Admin@123 }
 *     responses:
 *       200:
 *         description: Login result
 */
router.post('/adminlogin', loginLimiter, async (req, res) => {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(200).json({ status: 400, message: error.details[0].message });
    try {
        const user = await adminuser.findOne({ email: req.body.username });
        if (!user) {
            await recordLogin({ req, user: { email: req.body.username }, userType: 'admin', status: 'failed', failReason: 'user_not_found' });
            return res.status(200).json({ status: 500, message: 'No user found' });
        }
        const isHashed = user.password && user.password.startsWith('$2');
        const match = isHashed
            ? await bcrypt.compare(req.body.password, user.password)
            : req.body.password === user.password;
        if (!match) {
            await recordLogin({ req, user, userType: 'admin', status: 'failed', failReason: 'wrong_password' });
            return res.status(200).json({ status: 404, message: 'Oops! Wrong password' });
        }
        if (!isHashed) {
            const hash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
            await adminuser.findByIdAndUpdate(user._id, { password: hash });
        }
        const roleDoc = await roles.findOne({ name: new RegExp('^' + user.role + '$', 'i'), ...(user.company ? { company: user.company } : {}) });
        const tokens = signToken(user, roleDoc);
        await recordLogin({ req, user, userType: 'admin', status: 'success' });
        res.status(200).json({ status: 200, token: tokens.accessToken, refreshToken: tokens.refreshToken, data: [user], message: 'Successfully Logged in' });
    } catch (err) {
        res.status(200).json({ status: 500, message: err.message });
    }
});

// Field user login
router.post('/login', async (req, res) => {
    const { error } = userLoginSchema.validate(req.body);
    if (error) return res.status(200).json({ status: 400, message: error.details[0].message });
    return loginLimiter(req, res, async () => {
    try {
        const user = await userList.findOne({ empId: req.body.empId });
        if (!user) {
            await recordLogin({ req, user: { empId: req.body.empId }, userType: 'field', status: 'failed', failReason: 'user_not_found' });
            return res.status(200).json({ status: 500, message: 'No user found' });
        }
        const isHashed = user.password && user.password.startsWith('$2');
        const match = isHashed
            ? await bcrypt.compare(req.body.password, user.password)
            : req.body.password === user.password;
        if (!match) {
            await recordLogin({ req, user, userType: 'field', status: 'failed', failReason: 'wrong_password' });
            return res.status(200).json({ status: 404, message: 'Oops! Wrong password' });
        }
        if (!isHashed) {
            const hash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
            await userList.findByIdAndUpdate(user._id, { password: hash });
        }
        const tokens = signToken(user, null);
        await recordLogin({ req, user, userType: 'field', status: 'success' });
        res.status(200).json({ status: 200, token: tokens.accessToken, refreshToken: tokens.refreshToken, empId: user.empId, name: user.name, role: user.role, imgUrl: user.imgUrl, message: 'Successfully Logged in' });
    } catch (err) {
        res.status(200).json({ status: 500, message: err.message });
    }
    });
});

// Logout — blacklist the token in Redis
router.post('/logout', authenticate, async (req, res) => {
    await require('../config/tokenBlacklist').add(req.token);
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    recordLogout(req.user.id, ip);
    res.status(200).json({ status: 200, message: 'Logged out' });
});

// Refresh token
router.post('/refresh', async (req, res) => {
    if (!req.body.refreshToken) return res.status(200).json({ status: 401, message: 'No refresh token' });
    try {
        const decoded = jwt.verify(req.body.refreshToken, REFRESH_SECRET);
        const user = await adminuser.findById(decoded.id);
        if (!user) return res.status(200).json({ status: 401, message: 'User not found' });
        const roleDoc = await roles.findOne({ name: new RegExp('^' + user.role + '$', 'i'), ...(user.company ? { company: user.company } : {}) });
        const tokens = signToken(user, roleDoc);
        res.status(200).json({ status: 200, token: tokens.accessToken, refreshToken: tokens.refreshToken });
    } catch (e) {
        res.status(200).json({ status: 401, message: 'Invalid or expired refresh token' });
    }
});

// Forget password — sends secure reset token link
router.post('/forget', async (req, res) => {
    if (!req.body.email) return res.status(200).json({ status: 400, message: 'Email required' });
    try {
        const user = await userList.findOne({ email: req.body.email });
        if (!user) return res.status(200).json({ status: 200, message: 'If that email exists, a reset link has been sent' });
        const token = require('crypto').randomBytes(32).toString('hex');
        const expiry = Date.now() + 3600000; // 1 hour
        await userList.findByIdAndUpdate(user._id, { resetToken: token, resetTokenExpiry: expiry });
        const resetLink = (process.env.SERVER_URL || 'http://localhost:3010') + '/reset-password?token=' + token;
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST, port: 465, secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
            from: '"ManMove" <noreply@manmove.in>',
            to: req.body.email,
            subject: 'Password Reset Request',
            html: '<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="' + resetLink + '">' + resetLink + '</a></p>'
        });
        res.status(200).json({ status: 200, message: 'If that email exists, a reset link has been sent' });
    } catch (err) {
        res.status(200).json({ status: 500, message: err.message });
    }
});

const PROTECTED_ROLES = ['superadmin', 'administrator', 'admin'];

// ── Admin user CRUD — scoped to tenant ───────────────────────────────────────
router.get('/alladminuser', authenticate, async (req, res) => {
    try {
        const query = { ...req.query };
        if (!SUPERADMIN_ROLES.includes(req.user.role)) {
            if (!req.user.company) return res.status(200).json({ status: 403, message: 'No company scope in token' });
            query.company = req.user.company;
        }
        const data = await adminuser.find(query);
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/adminuser', authenticate, permit('create'), async (req, res) => {
    try {
        const data = Object.assign({}, req.body);
        if (!data.password) return res.status(200).json({ status: 400, message: 'Password required' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && PROTECTED_ROLES.includes(data.role?.toLowerCase())) {
            return res.status(200).json({ status: 403, message: 'Cannot create protected role accounts' });
        }
        if (!SUPERADMIN_ROLES.includes(req.user.role)) data.company = req.user.company;

        // ── Duplicate checks ──────────────────────────────────────────────
        const [emailExists, mobileExists] = await Promise.all([
            data.email  ? adminuser.exists({ email: data.email, company: data.company }) : null,
            data.mobile ? adminuser.exists({ mobile: data.mobile, company: data.company }) : null,
        ]);
        if (emailExists)  return res.status(200).json({ status: 400, message: `Email "${data.email}" is already registered in this company` });
        if (mobileExists) return res.status(200).json({ status: 400, message: `Mobile "${data.mobile}" is already registered in this company` });

        data.password = await bcrypt.hash(data.password, SALT_ROUNDS);
        const doc = await adminuser.create(data);
        await log({ req, action: 'ADMINUSER_CREATE', resource: 'adminuser', resourceId: doc._id, after: { name: data.name, email: data.email, role: data.role, company: data.company } });
        res.status(200).json({ status: 200, id: doc.id });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/adminuser/:id', authenticate, permit('update'), async (req, res) => {
    try {
        const existing = await adminuser.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'User not found' });
        // company admin cannot edit users from another company
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company) {
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company edit' });
        }
        const data = Object.assign({}, req.body);
        if (data.password && !data.password.startsWith('$2')) data.password = await bcrypt.hash(data.password, SALT_ROUNDS);
        await adminuser.findByIdAndUpdate(req.params.id, data);
        await log({ req, action: 'ADMINUSER_UPDATE', resource: 'adminuser', resourceId: req.params.id, before: { name: existing.name, role: existing.role }, after: { name: data.name, role: data.role } });
        res.status(200).json({ status: 200 });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.delete('/adminuser/:id', authenticate, permit('delete'), async (req, res) => {
    try {
        const existing = await adminuser.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'User not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company) {
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company delete' });
        }
        await adminuser.findByIdAndDelete(req.params.id);
        await log({ req, action: 'ADMINUSER_DELETE', resource: 'adminuser', resourceId: req.params.id, before: { name: existing.name, role: existing.role, company: existing.company } });
        res.status(200).json({ status: 200, message: 'Deleted' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Roles — scoped to tenant, protected names blocked ────────────────────────
router.get('/roles', authenticate, async (req, res) => {
    try {
        const query = { ...req.query };
        if (!SUPERADMIN_ROLES.includes(req.user.role)) {
            if (!req.user.company) return res.status(200).json({ status: 403, message: 'No company scope in token' });
            query.company = req.user.company;
        }
        const data = await roles.find(query);
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.get('/rolepages/:name', authenticate, async (req, res) => {
    try {
        const company = req.query.company || '';
        // try cache first
        const cached = await permissionCache.get(req.params.name, company);
        if (cached) return res.status(200).json({ status: 200, ...cached });

        const role = await roles.findOne({ name: new RegExp('^' + req.params.name + '$', 'i') });
        if (!role) return res.status(200).json({ status: 200, pages: [], division: [], actions: {}, hiddenFields: [] });

        const data = { pages: role.pages, division: role.division || [], actions: role.actions || {}, hiddenFields: role.hiddenFields || [] };
        await permissionCache.set(req.params.name, company, data);
        res.status(200).json({ status: 200, ...data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/roles', authenticate, permit('assign'), async (req, res) => {
    try {
        if (!SUPERADMIN_ROLES.includes(req.user.role) && PROTECTED_ROLES.includes(req.body.name?.toLowerCase())) {
            return res.status(200).json({ status: 403, message: 'Cannot create protected roles' });
        }
        if (!SUPERADMIN_ROLES.includes(req.user.role)) req.body.company = req.user.company;

        // ── Duplicate check ───────────────────────────────────────────────
        const exists = await roles.findOne({ name: new RegExp('^' + req.body.name + '$', 'i'), company: req.body.company || null });
        if (exists) return res.status(200).json({ status: 400, message: `Role "${req.body.name}" already exists in this company` });

        const doc = await roles.create(req.body);
        await log({ req, action: 'ROLE_CREATE', resource: 'roles', resourceId: doc._id, after: { name: doc.name, company: doc.company, pages: doc.pages } });
        res.status(200).json({ status: 200, data: doc });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/roles/:id', authenticate, permit('assign'), async (req, res) => {
    try {
        const existing = await roles.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'Role not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company) {
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company role edit' });
        }
        const data = await roles.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await permissionCache.invalidate(existing.name, existing.company || '');
        await log({ req, action: 'ROLE_UPDATE', resource: 'roles', resourceId: req.params.id, before: { pages: existing.pages, actions: existing.actions }, after: { pages: req.body.pages, actions: req.body.actions } });
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.delete('/roles/:id', authenticate, permit('delete'), async (req, res) => {
    try {
        const existing = await roles.findById(req.params.id).lean();
        if (!existing) return res.status(200).json({ status: 404, message: 'Role not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && existing.company !== req.user.company) {
            return res.status(200).json({ status: 403, message: 'Forbidden: cross-company role delete' });
        }
        await roles.findByIdAndDelete(req.params.id);
        await permissionCache.invalidate(existing.name, existing.company || '');
        await log({ req, action: 'ROLE_DELETE', resource: 'roles', resourceId: req.params.id, before: { name: existing.name, company: existing.company } });
        res.status(200).json({ status: 200, message: 'Deleted' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// Reset password — consume token
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(200).json({ status: 400, message: 'Token and password required' });
    try {
        const user = await userList.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
        if (!user) return res.status(200).json({ status: 400, message: 'Invalid or expired reset token' });
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        await userList.findByIdAndUpdate(user._id, { password: hash, resetToken: null, resetTokenExpiry: null });
        res.status(200).json({ status: 200, message: 'Password reset successfully' });
    } catch (err) {
        res.status(200).json({ status: 500, message: err.message });
    }
});

// ── Session Logs — superadmin sees all, company admin sees own company ────────
router.get('/sessionlogs', authenticate, async (req, res) => {
    try {
        const SessionLog = require('../models/sessionlog');
        const { page = 1, limit = 50, company, userId, status, from, to, userType } = req.query;
        const query = {};

        if (!SUPERADMIN_ROLES.includes(req.user.role)) {
            query.company = req.user.company;
        } else if (company) {
            query.company = company;
        }

        if (userId)   query.userId = userId;
        if (status)   query.status = status;
        if (userType) query.userType = userType;
        if (from || to) {
            query.loginAt = {};
            if (from) query.loginAt.$gte = new Date(from);
            if (to)   query.loginAt.$lte = new Date(to);
        }

        const [data, total] = await Promise.all([
            SessionLog.find(query).sort({ loginAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
            SessionLog.countDocuments(query),
        ]);

        res.status(200).json({ status: 200, total, page: Number(page), pages: Math.ceil(total / limit), data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Active Sessions — who is logged in RIGHT NOW (last 30 min, no logout) ────
router.get('/activesessions', authenticate, async (req, res) => {
    try {
        const SessionLog = require('../models/sessionlog');
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        const query = { status: 'success', logoutAt: { $in: [null, undefined] }, loginAt: { $gte: thirtyMinAgo } };
        if (!SUPERADMIN_ROLES.includes(req.user.role)) query.company = req.user.company;
        else if (req.query.company) query.company = req.query.company;

        const data = await SessionLog.find(query).sort({ loginAt: -1 }).lean();
        res.status(200).json({ status: 200, count: data.length, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Export session logs as CSV ────────────────────────────────────────────────
router.get('/sessionlogs/export', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const SessionLog = require('../models/sessionlog');
        const { company, from, to } = req.query;
        const query = {};
        if (company) query.company = company;
        if (from || to) {
            query.loginAt = {};
            if (from) query.loginAt.$gte = new Date(from);
            if (to)   query.loginAt.$lte = new Date(to);
        }
        const data = await SessionLog.find(query).sort({ loginAt: -1 }).limit(10000).lean();

        const header = 'Name,Email,Role,Company,UserType,IP,Device,OS,Browser,City,Region,Country,IMEI,MAC,DeviceID,AppVersion,Status,FailReason,LoginAt,LogoutAt\n';
        const rows = data.map(r => [
            r.userName, r.userEmail, r.role, r.company, r.userType,
            r.ip, r.device, r.os, r.browser,
            r.city, r.region, r.country,
            r.imei || '', r.macAddress || '', r.deviceId || '', r.appVersion || '',
            r.status, r.failReason || '',
            r.loginAt ? new Date(r.loginAt).toISOString() : '',
            r.logoutAt ? new Date(r.logoutAt).toISOString() : '',
        ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="session-logs-${Date.now()}.csv"`);
        res.send(header + rows);
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Purge old session logs (retention policy) — superadmin only ───────────────
router.delete('/sessionlogs/purge', authenticate, requireSuperadmin, async (req, res) => {
    try {
        const SessionLog = require('../models/sessionlog');
        const days = parseInt(req.query.days) || 90;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await SessionLog.deleteMany({ loginAt: { $lt: cutoff } });
        await log({ req, action: 'SESSIONLOGS_PURGE', resource: 'sessionlogs', after: { days, deleted: result.deletedCount } });
        res.status(200).json({ status: 200, deleted: result.deletedCount, message: `Purged logs older than ${days} days` });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

// ── Revoke all sessions for a user (bump tokenVersion) ───────────────────────
// SuperAdmin can revoke anyone; Company Admin can only revoke users in their company.
router.post('/adminuser/:id/revoke-sessions', authenticate, async (req, res) => {
    try {
        const target = await adminuser.findById(req.params.id).lean();
        if (!target) return res.status(200).json({ status: 404, message: 'User not found' });
        if (!SUPERADMIN_ROLES.includes(req.user.role) && target.company !== req.user.company) {
            return res.status(200).json({ status: 403, message: 'Forbidden' });
        }
        await adminuser.findByIdAndUpdate(req.params.id, { $inc: { tokenVersion: 1 } });
        await log({ req, action: 'SESSIONS_REVOKED', resource: 'adminuser', resourceId: req.params.id });
        res.status(200).json({ status: 200, message: 'All sessions revoked' });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
