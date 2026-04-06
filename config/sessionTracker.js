/**
 * sessionTracker.js
 * Captures login session metadata — IP, device, OS, browser, location.
 * Location resolved via ip-api.com (free, no key needed, 45 req/min).
 * Also handles: suspicious login detection, concurrent session alert, failed lockout tracking.
 */

const SessionLog = require('../models/sessionlog');

function parseUserAgent(ua = '') {
    let device = 'Desktop';
    if (/mobile|android|iphone|ipad|tablet/i.test(ua)) {
        device = /ipad|tablet/i.test(ua) ? 'Tablet' : 'Mobile';
    }
    let os = 'Unknown';
    if      (/windows nt 10/i.test(ua))   os = 'Windows 10/11';
    else if (/windows nt 6\.3/i.test(ua)) os = 'Windows 8.1';
    else if (/android ([\d.]+)/i.test(ua)) os = 'Android ' + ua.match(/android ([\d.]+)/i)[1];
    else if (/iphone os ([\d_]+)/i.test(ua)) os = 'iOS ' + ua.match(/iphone os ([\d_]+)/i)[1].replace(/_/g, '.');
    else if (/ipad.*os ([\d_]+)/i.test(ua)) os = 'iPadOS ' + ua.match(/ipad.*os ([\d_]+)/i)[1].replace(/_/g, '.');
    else if (/mac os x/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    let browser = 'Unknown';
    if      (/edg\/([\d.]+)/i.test(ua))     browser = 'Edge '    + ua.match(/edg\/([\d.]+)/i)[1].split('.')[0];
    else if (/opr\/([\d.]+)/i.test(ua))     browser = 'Opera '   + ua.match(/opr\/([\d.]+)/i)[1].split('.')[0];
    else if (/chrome\/([\d.]+)/i.test(ua))  browser = 'Chrome '  + ua.match(/chrome\/([\d.]+)/i)[1].split('.')[0];
    else if (/firefox\/([\d.]+)/i.test(ua)) browser = 'Firefox ' + ua.match(/firefox\/([\d.]+)/i)[1].split('.')[0];
    else if (/safari\/([\d.]+)/i.test(ua))  browser = 'Safari';
    else if (/postman/i.test(ua))           browser = 'Postman';
    return { device, os, browser };
}

async function resolveLocation(ip) {
    try {
        if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return { city: 'Localhost', region: '', country: 'Local' };
        }
        const http = require('http');
        return await new Promise((resolve) => {
            const req = http.get(`http://ip-api.com/json/${ip}?fields=city,regionName,country,lat,lon`, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try {
                        const j = JSON.parse(data);
                        resolve({ city: j.city, region: j.regionName, country: j.country, latitude: j.lat, longitude: j.lon });
                    } catch { resolve({}); }
                });
            });
            req.setTimeout(2000, () => { req.destroy(); resolve({}); });
            req.on('error', () => resolve({}));
        });
    } catch { return {}; }
}

/**
 * Check if this login is from a new country/city never seen before for this user.
 * Returns true if suspicious.
 */
async function isSuspiciousLocation(userId, country, city) {
    if (!country || country === 'Local') return false;
    const prev = await SessionLog.findOne({ userId, status: 'success', country }).lean();
    return !prev; // never logged in from this country before
}

/**
 * Check if user is already logged in from a different IP right now (within last 30 min).
 */
async function hasConcurrentSession(userId, currentIp) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recent = await SessionLog.findOne({
        userId,
        status: 'success',
        logoutAt: { $in: [null, undefined] },
        loginAt: { $gte: thirtyMinAgo },
        ip: { $ne: currentIp },
    }).lean();
    return !!recent;
}

/**
 * Send alert email to superadmin for suspicious/concurrent login.
 * Fire-and-forget.
 */
async function sendSecurityAlert({ type, user, ip, location, userAgent }) {
    try {
        if (!process.env.EMAIL_HOST || !process.env.ALERT_EMAIL) return;
        const nodemailer = require('nodemailer');
        const t = nodemailer.createTransport({
            host: process.env.EMAIL_HOST, port: 465, secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        const subject = type === 'suspicious'
            ? `⚠️ Suspicious Login: ${user.userName || user.userEmail}`
            : `🔴 Concurrent Session: ${user.userName || user.userEmail}`;
        const html = `
            <h3>${subject}</h3>
            <table>
                <tr><td><b>User</b></td><td>${user.userName} (${user.userEmail})</td></tr>
                <tr><td><b>Company</b></td><td>${user.company || 'N/A'}</td></tr>
                <tr><td><b>IP</b></td><td>${ip}</td></tr>
                <tr><td><b>Location</b></td><td>${location.city}, ${location.region}, ${location.country}</td></tr>
                <tr><td><b>Device</b></td><td>${userAgent}</td></tr>
                <tr><td><b>Time</b></td><td>${new Date().toISOString()}</td></tr>
            </table>
        `;
        await t.sendMail({ from: process.env.EMAIL_USER, to: process.env.ALERT_EMAIL, subject, html });
    } catch (_) {}
}

/**
 * Record a login attempt. Fire-and-forget — never throws, never blocks login.
 */
async function recordLogin({ req, user, userType = 'admin', status = 'success', failReason = null }) {
    try {
        const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
        const ua = req.headers['user-agent'] || '';
        const { device, os, browser } = parseUserAgent(ua);
        const location = await resolveLocation(ip);

        const imei       = req.headers['x-device-imei'] || req.body?.deviceImei    || null;
        const macAddress = req.headers['x-device-mac']  || req.body?.deviceMac     || null;
        const deviceId   = req.headers['x-device-id']   || req.body?.deviceId      || null;
        const appVersion = req.headers['x-app-version'] || req.body?.appVersion    || null;

        const userId = user?._id?.toString() || 'unknown';

        // ── Security checks (only on successful logins) ──────────────────
        if (status === 'success' && userId !== 'unknown') {
            const [suspicious, concurrent] = await Promise.all([
                isSuspiciousLocation(userId, location.country, location.city),
                hasConcurrentSession(userId, ip),
            ]);

            const alertPayload = {
                user: { userName: user?.name, userEmail: user?.email || user?.empId, company: user?.company },
                ip, location, userAgent: ua,
            };

            if (suspicious) {
                sendSecurityAlert({ type: 'suspicious', ...alertPayload });
                // Emit real-time alert via socket.io if available
                const io = req.app?.get('io');
                if (io) io.emit('security:alert', { type: 'suspicious_login', userId, ip, ...location, time: new Date() });
            }
            if (concurrent) {
                sendSecurityAlert({ type: 'concurrent', ...alertPayload });
                const io = req.app?.get('io');
                if (io) io.emit('security:alert', { type: 'concurrent_session', userId, ip, ...location, time: new Date() });
            }
        }

        await SessionLog.create({
            userId,
            userEmail:  user?.email || user?.empId || '',
            userName:   user?.name  || '',
            userType,
            role:       user?.role    || '',
            company:    user?.company || '',
            ip, userAgent: ua,
            device, os, browser,
            imei, macAddress, deviceId, appVersion,
            ...location,
            status,
            failReason,
        });
    } catch (_) { /* never block login */ }
}

/**
 * Mark session as logged out by userId + IP (best-effort).
 */
async function recordLogout(userId, ip) {
    try {
        await SessionLog.findOneAndUpdate(
            { userId, ip, logoutAt: null, status: 'success' },
            { logoutAt: new Date() },
            { sort: { loginAt: -1 } }
        );
    } catch (_) {}
}

module.exports = { recordLogin, recordLogout };

