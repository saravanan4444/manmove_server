/**
 * Alert Manager — sends email when error rate spikes or response time degrades
 * Checks every 60s, alerts max once per 10 minutes to avoid spam
 */
const nodemailer = require('nodemailer');
const logger     = require('./logger');

const ALERT_INTERVAL_MS  = 10 * 60 * 1000; // 10 min cooldown between alerts
const CHECK_INTERVAL_MS  = 60 * 1000;       // check every 60s
const ERROR_RATE_THRESH  = 0.05;            // alert if >5% of requests are errors
const SLOW_REQ_THRESH_MS = 2000;            // alert if p95 response time > 2s
const MIN_REQUESTS       = 10;              // don't alert on low traffic

let lastAlertAt = 0;
const window = { requests: 0, errors: 0, responseTimes: [] };

function record(ms, isError) {
    window.requests++;
    if (isError) window.errors++;
    window.responseTimes.push(ms);
    if (window.responseTimes.length > 500) window.responseTimes.shift();
}

function p95(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)];
}

async function sendAlert(subject, body) {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: 465,
            secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to:   process.env.ALERT_EMAIL || process.env.EMAIL_USER,
            subject: `🚨 ManMove Server Alert: ${subject}`,
            text: body
        });
        logger.warn('Alert sent', { subject });
    } catch (e) {
        logger.error('Alert email failed', { error: e.message });
    }
}

function startAlertMonitor() {
    setInterval(() => {
        if (window.requests < MIN_REQUESTS) return;
        const now = Date.now();
        if (now - lastAlertAt < ALERT_INTERVAL_MS) return;

        const errorRate = window.errors / window.requests;
        const p95ms     = p95(window.responseTimes);
        const alerts    = [];

        if (errorRate > ERROR_RATE_THRESH)
            alerts.push(`Error rate: ${(errorRate * 100).toFixed(1)}% (${window.errors}/${window.requests} requests)`);
        if (p95ms > SLOW_REQ_THRESH_MS)
            alerts.push(`p95 response time: ${p95ms}ms (threshold: ${SLOW_REQ_THRESH_MS}ms)`);

        if (alerts.length) {
            lastAlertAt = now;
            const body = [
                `Server: ${process.env.SERVER_URL || 'unknown'}`,
                `Time: ${new Date().toISOString()}`,
                `Environment: ${process.env.NODE_ENV || 'development'}`,
                '',
                ...alerts,
                '',
                `Window: last ${window.requests} requests`,
            ].join('\n');
            sendAlert(alerts[0], body);
        }

        // reset window
        window.requests = 0;
        window.errors   = 0;
        window.responseTimes = [];
    }, CHECK_INTERVAL_MS);
}

module.exports = { record, startAlertMonitor, p95, getWindow: () => window };
