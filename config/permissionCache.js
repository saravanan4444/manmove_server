/**
 * permissionCache.js
 * Redis-backed cache for role permission lookups.
 * Avoids DB hit on every request for role pages/actions.
 * TTL: 5 minutes — short enough to reflect role changes quickly.
 */
const redis = require('./redis');

const PREFIX = 'role:';
const TTL    = 300; // 5 minutes

module.exports = {
    get: async (roleName, company) => {
        if (!redis) return null;
        try {
            const val = await redis.get(`${PREFIX}${company}:${roleName}`);
            return val ? JSON.parse(val) : null;
        } catch (_) { return null; }
    },

    set: async (roleName, company, data) => {
        if (!redis) return;
        try {
            await redis.set(`${PREFIX}${company}:${roleName}`, JSON.stringify(data), 'EX', TTL);
        } catch (_) {}
    },

    // Call this when a role is updated/deleted — invalidates cache immediately
    invalidate: async (roleName, company) => {
        if (!redis) return;
        try { await redis.del(`${PREFIX}${company}:${roleName}`); } catch (_) {}
    },
};
