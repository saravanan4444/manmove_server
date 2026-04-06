/**
 * sla-escalation.js
 * Runs every hour. Escalates maintenance tickets breaching SLA thresholds.
 * Critical: 4h, High: 8h, Medium: 24h, Low: 72h
 */
const CameraMaintenance = require('../models/cameramaintenance');
const nodemailer = require('nodemailer');

const SLA_HOURS = { critical: 4, high: 8, medium: 24, low: 72 };

async function sendEscalation(ticket) {
  if (!process.env.EMAIL_HOST || !process.env.ALERT_EMAIL) return;
  try {
    const t = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, port: 465, secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    const hours = Math.floor((Date.now() - new Date(ticket.created_at)) / 3600000);
    await t.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ALERT_EMAIL,
      subject: `🚨 SLA Breach [${ticket.priority?.toUpperCase()}] — Camera Ticket #${ticket._id}`,
      html: `
        <h3>SLA Breach Alert</h3>
        <table>
          <tr><td><b>Priority</b></td><td>${ticket.priority}</td></tr>
          <tr><td><b>Fault</b></td><td>${ticket.fault_type}</td></tr>
          <tr><td><b>Description</b></td><td>${ticket.description}</td></tr>
          <tr><td><b>Assigned To</b></td><td>${ticket.assigned_name || ticket.assigned_to || 'Unassigned'}</td></tr>
          <tr><td><b>Open Since</b></td><td>${hours}h (SLA: ${SLA_HOURS[ticket.priority || 'medium']}h)</td></tr>
        </table>
      `,
    });
  } catch (_) {}
}

async function runEscalation(io) {
  try {
    const openTickets = await CameraMaintenance.find({
      status: { $in: ['open', 'assigned', 'in_progress'] },
    }).lean();

    for (const ticket of openTickets) {
      const slaHours = SLA_HOURS[ticket.priority || 'medium'];
      const ageHours = (Date.now() - new Date(ticket.created_at)) / 3600000;
      if (ageHours >= slaHours && !ticket.sla_breached) {
        await CameraMaintenance.findByIdAndUpdate(ticket._id, { sla_breached: true });
        await sendEscalation(ticket);
        if (io) io.emit('sla:breach', { ticketId: ticket._id, priority: ticket.priority, ageHours: Math.floor(ageHours) });
      }
    }
  } catch (_) {}
}

function startSlaEscalation(io) {
  runEscalation(io);
  setInterval(() => runEscalation(io), 60 * 60 * 1000); // every hour
}

module.exports = { startSlaEscalation };
