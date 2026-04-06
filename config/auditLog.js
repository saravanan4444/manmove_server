/**
 * auditLog.js
 * Senior-level audit trail.
 * Logs every permission/role/company change with who, what, before, after, when.
 */

const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
    actorId:    { type: String, required: true },   // who did it
    actorEmail: String,
    actorRole:  String,
    company:    String,                              // actor's company (null = superadmin)
    action:     { type: String, required: true },   // e.g. ROLE_CREATE, COMPANY_UPDATE
    resource:   String,                             // e.g. 'roles', 'companies', 'adminuser'
    resourceId: String,                             // document _id affected
    before:     mongoose.Schema.Types.Mixed,        // snapshot before change
    after:      mongoose.Schema.Types.Mixed,        // snapshot after change
    ip:         String,
    requestId:  String,
    timestamp:  { type: Date, default: Date.now, index: true },
}, { versionKey: false });

auditSchema.index({ actorId: 1, timestamp: -1 });
auditSchema.index({ company: 1, timestamp: -1 });
auditSchema.index({ action: 1 });

const AuditLog = mongoose.model('AuditLog', auditSchema);

/**
 * log — write an audit entry. Fire-and-forget (never throws).
 */
async function log({ req, action, resource, resourceId, before, after }) {
    try {
        await AuditLog.create({
            actorId:    req.user?.id    || 'system',
            actorEmail: req.user?.email || '',
            actorRole:  req.user?.role  || '',
            company:    req.user?.company || null,
            action,
            resource,
            resourceId: resourceId?.toString(),
            before,
            after,
            ip:        req.ip || req.headers['x-forwarded-for'] || '',
            requestId: req.id || '',
        });
    } catch (_) { /* never block the request */ }
}

module.exports = { AuditLog, log };
