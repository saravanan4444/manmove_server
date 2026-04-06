/**
 * tenantMiddleware.js
 * Senior-level multi-tenant isolation.
 * Automatically scopes every request to the authenticated user's tenant (company → zone → area).
 * SuperAdmin bypasses all scoping.
 */

const SUPERADMIN_ROLES = ['superadmin', 'administrator'];

/**
 * scopeToTenant — replaces the old scopeToCompany.
 * Enforces company + optional zone + optional area on GET queries and POST/PUT bodies.
 */
function scopeToTenant(req, res, next) {
    if (SUPERADMIN_ROLES.includes(req.user?.role)) return next();

    const { company, zone, area } = req.user;

    if (req.method === 'GET') {
        if (company) req.query.company = company;
        if (zone)    req.query.zone    = zone;
        // area is an array — only inject if not already specified
        if (area?.length && !req.query.area) req.query.area = area;
    } else if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && typeof req.body === 'object') {
        if (company) req.body.company = company;
        // do NOT override zone/area on writes — allow user to specify their own sub-scope
    }
    next();
}

/**
 * requireSuperadmin — hard block for superadmin-only endpoints.
 */
function requireSuperadmin(req, res, next) {
    if (!SUPERADMIN_ROLES.includes(req.user?.role))
        return res.status(403).json({ status: 403, message: 'Forbidden: superadmin only' });
    next();
}

/**
 * requireCompanyMatch — verifies a document's company matches the requester's company.
 * Use on PUT/DELETE where you fetch a doc first.
 * Usage: requireCompanyMatch(doc) inside route handler.
 */
function requireCompanyMatch(req, docCompany) {
    if (SUPERADMIN_ROLES.includes(req.user?.role)) return true;
    return req.user?.company === docCompany;
}

module.exports = { scopeToTenant, requireSuperadmin, requireCompanyMatch };
