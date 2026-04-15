/**
 * routes/device-proxy.js
 * Network scanner + transparent HTTP proxy for NVR/Camera web UIs.
 *
 * Endpoints:
 *   GET /nvrs/scan?subnet=192.168.1&ports=80,8080      — scan subnet for devices
 *   ALL /nvrs/proxy/:ip/*                               — proxy device web UI
 */

const router  = require('express').Router();
const http    = require('http');
const https   = require('https');
const net     = require('net');
const url     = require('url');
const { authenticate } = require('../config/authMiddleware');

// ── Common NVR/Camera ports ──────────────────────────────────────────────────
const DEFAULT_PORTS = [80, 8080, 8000, 8888];
const SCAN_TIMEOUT  = 800; // ms per port probe
const MAX_HOSTS     = 254;

// ── Port probe ───────────────────────────────────────────────────────────────
function probePort(ip, port) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(SCAN_TIMEOUT);
    sock.on('connect', () => { sock.destroy(); resolve({ ip, port, open: true }); });
    sock.on('timeout', () => { sock.destroy(); resolve({ ip, port, open: false }); });
    sock.on('error',   () => { sock.destroy(); resolve({ ip, port, open: false }); });
    sock.connect(port, ip);
  });
}

// ── Scan subnet (e.g. "192.168.1") ──────────────────────────────────────────
async function scanSubnet(subnet, ports) {
  const tasks = [];
  for (let i = 1; i <= MAX_HOSTS; i++) {
    const ip = `${subnet}.${i}`;
    for (const port of ports) {
      tasks.push(probePort(ip, port));
    }
  }

  // Run in batches of 100 concurrent probes
  const BATCH = 100;
  const results = [];
  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = await Promise.all(tasks.slice(i, i + BATCH));
    results.push(...batch);
  }

  // Group open ports by IP
  const deviceMap = {};
  results.filter(r => r.open).forEach(r => {
    if (!deviceMap[r.ip]) deviceMap[r.ip] = { ip: r.ip, ports: [] };
    deviceMap[r.ip].ports.push(r.port);
  });

  return Object.values(deviceMap).map(d => ({
    ip:      d.ip,
    ports:   d.ports,
    webPort: d.ports.find(p => [80, 8080, 8888, 8000].includes(p)) || d.ports[0],
    type:    guessType(d.ports),
  }));
}

function guessType(ports) {
  if (ports.includes(37777)) return 'Dahua NVR';
  if (ports.includes(8000))  return 'Hikvision NVR';
  if (ports.includes(554))   return 'IP Camera (RTSP)';
  if (ports.includes(80) || ports.includes(8080)) return 'Web Device';
  return 'Unknown';
}

// ── GET /nvrs/scan ───────────────────────────────────────────────────────────
router.get('/nvrs/scan', authenticate, async (req, res) => {
  const subnet = (req.query.subnet || '').replace(/\.$/, '');
  if (!subnet || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnet)) {
    return res.json({ status: 400, message: 'subnet required, e.g. 192.168.1' });
  }
  const ports = (req.query.ports || DEFAULT_PORTS.join(',')).split(',').map(Number).filter(Boolean);
  try {
    const devices = await scanSubnet(subnet, ports);
    res.json({ status: 200, data: devices, scanned: `${subnet}.1 - ${subnet}.254` });
  } catch (err) {
    res.json({ status: 500, message: err.message });
  }
});

// ── ALL /nvrs/proxy/:ip/* — transparent proxy ────────────────────────────────
// Rewrites the device's HTML so all relative links go back through the proxy.
router.all('/nvrs/proxy/:ip', authenticate, proxyHandler);
router.all('/nvrs/proxy/:ip/*', authenticate, proxyHandler);

function proxyHandler(req, res) {
  const deviceIp   = req.params.ip;
  const port       = parseInt(req.query.port) || 80;
  const devicePath = '/' + (req.params[0] || '');
  const qs         = req.query.port ? '' : (req.url.split('?')[1] ? '?' + req.url.split('?')[1] : '');

  // Validate IP
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(deviceIp)) {
    return res.status(400).json({ status: 400, message: 'Invalid IP' });
  }

  const options = {
    hostname: deviceIp,
    port,
    path: devicePath + qs,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${deviceIp}:${port}`,
    },
    timeout: 8000,
  };
  // Remove headers that break proxying
  delete options.headers['accept-encoding'];

  const proxyReq = http.request(options, proxyRes => {
    const contentType = proxyRes.headers['content-type'] || '';

    // Rewrite Location headers for redirects
    if (proxyRes.headers['location']) {
      const loc = proxyRes.headers['location'];
      proxyRes.headers['location'] = rewriteUrl(loc, deviceIp, port, req);
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    // Rewrite HTML to redirect all links through proxy
    if (contentType.includes('text/html')) {
      let body = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        const rewritten = rewriteHtml(body, deviceIp, port, req);
        res.end(rewritten);
      });
    } else {
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', err => {
    if (!res.headersSent) res.json({ status: 502, message: `Device unreachable: ${err.message}` });
  });
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) res.json({ status: 504, message: 'Device timeout' });
  });

  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

function rewriteUrl(targetUrl, ip, port, req) {
  const base = `${req.protocol}://${req.get('host')}`;
  const proxyBase = `${base}/rest/api/latest/nvrs/proxy/${ip}?port=${port}&path=`;
  if (targetUrl.startsWith('http')) {
    const parsed = url.parse(targetUrl);
    return proxyBase + encodeURIComponent(parsed.path);
  }
  return proxyBase + encodeURIComponent(targetUrl);
}

function rewriteHtml(html, ip, port, req) {
  const base = `/rest/api/latest/nvrs/proxy/${ip}`;
  // Rewrite href and src attributes pointing to absolute paths
  return html
    .replace(/(href|src|action)="(\/[^"]*?)"/g, (_, attr, path) =>
      `${attr}="${base}${path}?port=${port}"`)
    .replace(/(href|src|action)='(\/[^']*?)'/g, (_, attr, path) =>
      `${attr}='${base}${path}?port=${port}'`);
}

module.exports = router;
