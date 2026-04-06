/**
 * http-health.js
 * HTTP health check for software NVR / VMS systems.
 * Returns { alive, latency, statusCode }.
 */
const http  = require('http');
const https = require('https');

function checkHttpHealth(url, token, timeoutMs = 4000) {
  return new Promise(resolve => {
    const start = Date.now();
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      timeout:  timeoutMs,
      headers:  token ? { Authorization: `Bearer ${token}` } : {},
    };

    const req = lib.request(options, res => {
      res.resume(); // drain
      const latency = Date.now() - start;
      const alive = res.statusCode >= 200 && res.statusCode < 400;
      resolve({ alive, latency, statusCode: res.statusCode });
    });

    req.on('timeout', () => { req.destroy(); resolve({ alive: false, latency: null, statusCode: null }); });
    req.on('error',   () => resolve({ alive: false, latency: null, statusCode: null }));
    req.end();
  });
}

module.exports = { checkHttpHealth };
