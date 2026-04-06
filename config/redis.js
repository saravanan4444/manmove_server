/**
 * redis.js — shared Redis client singleton
 * Falls back gracefully if REDIS_URL is not set (dev mode).
 */
const Redis = require('ioredis');

let client = null;

if (process.env.REDIS_URL) {
    client = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
    });
    client.on('connect',  () => console.log('[Redis] connected'));
    client.on('error',    (e) => console.error('[Redis] error:', e.message));
}

module.exports = client;
