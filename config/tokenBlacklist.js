/**
 * tokenBlacklist.js
 * Redis-backed token blacklist — survives server restarts, works across multiple instances.
 * Falls back to in-memory Set if Redis is not configured (dev/local).
 */
const redis = require('./redis');
const jwt   = require('jsonwebtoken');

const memBlacklist = new Set(); // fallback

const PREFIX = 'bl:'; // Redis key prefix

module.exports = {
    // Add token — TTL = remaining token lifetime so Redis auto-expires it
    add: async (token) => {
        if (!redis) { memBlacklist.add(token); return; }
        try {
            const decoded = jwt.decode(token);
            const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 43200;
            if (ttl > 0) await redis.set(PREFIX + token, '1', 'EX', ttl);
        } catch (_) { memBlacklist.add(token); }
    },

    // Check if token is blacklisted
    has: async (token) => {
        if (!redis) return memBlacklist.has(token);
        try {
            const val = await redis.get(PREFIX + token);
            return val === '1';
        } catch (_) { return memBlacklist.has(token); }
    },

    // No-op — Redis TTL handles cleanup automatically
    startCleanup: () => {},
};
