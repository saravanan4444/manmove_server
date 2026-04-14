/**
 * rateLimiter.js
 * Redis-backed rate limiting with per-role tiers.
 * Falls back to memory store if REDIS_URL is not set.
 */
const rateLimit = require('express-rate-limit');

const makeStore = process.env.REDIS_URL
    ? (prefix) => {
        const { RedisStore } = require('rate-limit-redis');
        const redis = require('./redis');
        return new RedisStore({ prefix, sendCommand: (...args) => redis.call(...args) });
    }
    : null;

let _storeCounter = 0;
const make = (max, windowMs = 15 * 60 * 1000) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    ...(makeStore ? { store: makeStore(`rl:${++_storeCounter}:`) } : {}),
});

// Per-role dynamic limiter — superadmin gets 5000, admin 2000, others 500
function byRole(req, res, next) {
    const role = req.user?.role?.toLowerCase() || 'anonymous';
    const max  = ['superadmin', 'administrator'].includes(role) ? 5000
               : role === 'admin'   ? 2000
               : role === 'manager' ? 1000
               : 500;
    return make(max)(req, res, next);
}

module.exports = {
    global: make(1000),
    login:  make(50, 15 * 60 * 1000),
    byRole,
};
