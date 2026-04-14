/**
 * authMiddleware.js — RBAC + ABAC + Tenant isolation
 */

const jwt      = require('jsonwebtoken');
const roles    = require('../models/roles');
const blacklist = require('./tokenBlacklist');
const { canDo } = require('./permissionMatrix');

const SECRET         = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const SUPERADMIN_ROLES = ['superadmin', 'administrator'];

// ── Authenticate ─────────────────────────────────────────────────────────────
async function authenticate(req, res, next) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ status: 401, message: 'No token' });
    try {
        const isBlacklisted = await blacklist.has(token);
        if (isBlacklisted) return res.status(401).json({ status: 401, message: 'Token revoked' });

        const payload = jwt.verify(token, SECRET);
        if (payload.tokenVersion !== undefined) {
            const adminuser = require('../models/adminuser');
            const user = await adminuser.findById(payload.id).lean();
            if (!user) return res.status(401).json({ status: 401, message: 'User not found' });
            if ((user.tokenVersion || 0) !== payload.tokenVersion)
                return res.status(401).json({ status: 401, message: 'Session expired, please login again' });
        }
        req.user  = payload;
        req.token = token;
        next();
    } catch (e) {
        return res.status(401).json({ status: 401, message: 'Invalid or expired token' });
    }
}

// ── SuperAdmin guard ──────────────────────────────────────────────────────────
function requireSuperadmin(req, res, next) {
    if (!SUPERADMIN_ROLES.includes(req.user?.role))
        return res.status(403).json({ status: 403, message: 'Forbidden: superadmin only' });
    next();
}

// ── Tenant isolation ──────────────────────────────────────────────────────────
function scopeToTenant(req, res, next) {
    if (SUPERADMIN_ROLES.includes(req.user?.role)) return next();
    const { company, zone, area } = req.user;
    if (req.method === 'GET') {
        if (company) req.query.company = company;
        if (zone)    req.query.zone    = zone;
        if (area?.length && !req.query.area) req.query.area = area;
    } else if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && typeof req.body === 'object') {
        if (company) req.body.company = company;
    }
    next();
}

const scopeToCompany = scopeToTenant; // backward compat alias

// ── Legacy permit ─────────────────────────────────────────────────────────────
function permit(action) {
    return (req, res, next) => {
        if (SUPERADMIN_ROLES.includes(req.user?.role)) return next();
        if (req.user?.actions?.[action] === true) return next();
        return res.status(403).json({ status: 403, message: 'Permission denied: ' + action });
    };
}

// ── Fine-grained resource:action check ───────────────────────────────────────
function permitMatrix(resource, action) {
    return (req, res, next) => {
        if (SUPERADMIN_ROLES.includes(req.user?.role)) return next();
        if (canDo(req.user?.role, resource, action, req.user?.actions || {})) return next();
        return res.status(403).json({ status: 403, message: `Permission denied: ${resource}:${action}` });
    };
}

// ── Sign tokens ───────────────────────────────────────────────────────────────
function signToken(userData, roleDoc) {
    const payload = {
        id:           userData._id,
        name:         userData.name,
        email:        userData.email,
        role:         userData.role,
        company:      userData.company  || '',
        zone:         userData.zone     || '',
        area:         userData.area     || [],
        division:     userData.division || ['isp'],
        pages:        roleDoc?.pages        || userData.pages || [],
        actions:      roleDoc?.actions      || {},
        hiddenFields: roleDoc?.hiddenFields || [],
        tokenVersion: userData.tokenVersion || 0,
    };
    const accessToken  = jwt.sign(payload, SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign(
        { id: userData._id, email: userData.email, tokenVersion: payload.tokenVersion },
        REFRESH_SECRET,
        { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
}

module.exports = {
    authenticate,
    requireSuperadmin,
    scopeToTenant,
    scopeToCompany,
    permit,
    permitMatrix,
    signToken,
    SECRET,
    REFRESH_SECRET,
    SUPERADMIN_ROLES,
};
