/**
 * routes/audit.js
 * Audit log viewer — SuperAdmin sees all, Company Admin sees own company only.
 */
const express  = require('express');
const router   = express.Router();
const { AuditLog } = require('../config/auditLog');
const { authenticate, SUPERADMIN_ROLES } = require('../config/authMiddleware');

router.get('/auditlogs', authenticate, async (req, res) => {
    try {
        const query = {};
        if (!SUPERADMIN_ROLES.includes(req.user.role)) query.company = req.user.company;
        if (req.query.action)   query.action   = req.query.action;
        if (req.query.resource) query.resource = req.query.resource;
        if (req.query.actorId)  query.actorId  = req.query.actorId;

        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const skip  = parseInt(req.query.skip) || 0;

        const [data, total] = await Promise.all([
            AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
            AuditLog.countDocuments(query),
        ]);
        res.status(200).json({ status: 200, total, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
