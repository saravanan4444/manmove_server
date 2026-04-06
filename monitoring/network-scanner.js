/**
 * Network Scanner — discovers IP cameras on local subnet
 * Scans port 554 (RTSP) and 80 (HTTP) to find camera devices
 */
const net  = require('net');
const os   = require('os');

// Get local subnet (e.g. 192.168.1) from network interfaces
function getLocalSubnet() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                const parts = iface.address.split('.');
                return parts.slice(0, 3).join('.'); // e.g. "192.168.1"
            }
        }
    }
    return '192.168.1'; // fallback
}

// Check if a specific port is open on an IP (TCP connect)
function checkPort(ip, port, timeoutMs = 1000) {
    return new Promise(resolve => {
        const sock = new net.Socket();
        let done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            sock.destroy();
            resolve(result);
        };
        sock.setTimeout(timeoutMs);
        sock.connect(port, ip, () => finish(true));
        sock.on('error', () => finish(false));
        sock.on('timeout', () => finish(false));
    });
}

// Scan one IP — check ports 554 (RTSP), 80 (HTTP), 8080 (alt HTTP)
async function scanIp(ip) {
    const [rtsp, http, http8080] = await Promise.all([
        checkPort(ip, 554),
        checkPort(ip, 80),
        checkPort(ip, 8080),
    ]);
    if (rtsp || http || http8080) {
        return {
            ip_address: ip,
            rtsp_port:  rtsp  ? 554  : null,
            http_port:  http  ? 80   : (http8080 ? 8080 : null),
            rtsp_url:   rtsp  ? `rtsp://${ip}:554/stream` : null,
            detected_at: new Date().toISOString(),
        };
    }
    return null;
}

// Scan full subnet in batches of 20 concurrent
async function scanSubnet(subnet, onProgress) {
    const results = [];
    const total = 254;
    let scanned = 0;

    for (let batch = 1; batch <= total; batch += 20) {
        const promises = [];
        for (let i = batch; i < batch + 20 && i <= total; i++) {
            promises.push(scanIp(`${subnet}.${i}`));
        }
        const found = (await Promise.all(promises)).filter(Boolean);
        results.push(...found);
        scanned = Math.min(batch + 19, total);
        if (onProgress) onProgress(scanned, total, found);
    }
    return results;
}

// Scan ALL common private IP ranges
async function scanAllRanges(onProgress) {
    const subnets = [];
    // 192.168.0.x → 192.168.255.x
    for (let i = 0; i <= 255; i++) subnets.push(`192.168.${i}`);
    // 10.0.0.x → 10.0.255.x (most common)
    for (let i = 0; i <= 255; i++) subnets.push(`10.0.${i}`);
    // 172.16.0.x → 172.31.0.x
    for (let i = 16; i <= 31; i++) subnets.push(`172.${i}.0`);

    const results = [];
    let totalScanned = 0;
    const totalSubnets = subnets.length;

    for (const subnet of subnets) {
        const found = await scanSubnet(subnet, null);
        results.push(...found);
        totalScanned++;
        if (onProgress) onProgress(totalScanned, totalSubnets, found, subnet);
    }
    return results;
}

module.exports = { scanSubnet, scanIp, getLocalSubnet, scanAllRanges };
