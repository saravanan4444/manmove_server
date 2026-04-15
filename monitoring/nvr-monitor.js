const Nvr            = require('../models/nvr');
const NocAlert       = require('../models/nocAlert');
const NvrStatusLog   = require('../models/nvrstatuslog');
const { pingHost }   = require('./ping');
const { checkHttpHealth } = require('./http-health');
const { predictHddFailure, predictStorageFull } = require('./ai-engine');

const INTERVAL_MS    = 60 * 1000;
const FAIL_THRESHOLD = 3;

// ── Check a single NVR — hardware or software ─────────────────────────────
async function checkNvr(nvr, io) {
  if (!nvr.ip_address && !nvr.health_endpoint) return;

  // Hardware NVR → ICMP ping | Software NVR → HTTP health endpoint
  const { alive, latency } = nvr.nvr_type === 'software' && nvr.health_endpoint
    ? await checkHttpHealth(nvr.health_endpoint, nvr.health_token)
    : await pingHost(nvr.ip_address, 3000);

  const now    = new Date();
  const update = { last_ping_ms: latency, updated_at: now };

  if (alive) {
    const wasOffline = nvr.status === 'offline';
    update.status               = 'online';
    update.last_seen            = now;
    update.consecutive_failures = 0;

    if (wasOffline) {
      io.emit('nvr:status_change', { nvr_id: nvr._id, nvr_number: nvr.nvr_number, status: 'online' });
      await NvrStatusLog.create({ nvr_id: nvr._id, nvr_number: nvr.nvr_number, company: nvr.company, status: 'online', changed_at: now });
      await NocAlert.updateMany(
        { description: { $regex: nvr.nvr_number }, severity: 'critical', resolved_at: null },
        { resolved_at: now }
      );

      // ── Failover: if this was the standby and primary is back, emit event ──
      if (nvr.is_failover && nvr.failover_nvr_id) {
        io.emit('nvr:failover_recovered', { standby_id: nvr._id, primary_id: nvr.failover_nvr_id, nvr_number: nvr.nvr_number });
      }
    }
  } else {
    const failures = (nvr.consecutive_failures || 0) + 1;
    update.consecutive_failures = failures;

    if (failures >= FAIL_THRESHOLD && nvr.status !== 'offline') {
      update.status = 'offline';
      io.emit('nvr:status_change', { nvr_id: nvr._id, nvr_number: nvr.nvr_number, status: 'offline', nvr_type: nvr.nvr_type });
      await NvrStatusLog.create({ nvr_id: nvr._id, nvr_number: nvr.nvr_number, company: nvr.company, status: 'offline', changed_at: now });

      const existing = await NocAlert.findOne({
        description: { $regex: nvr.nvr_number }, severity: 'critical', resolved_at: null
      });
      if (!existing) {
        const typeLabel = nvr.nvr_type === 'software'
          ? `${nvr.vms_type || 'Software NVR'} (${nvr.health_endpoint})`
          : `Hardware NVR (${nvr.ip_address})`;
        const alert = await NocAlert.create({
          severity:    'critical',
          company:     nvr.company,
          description: `NVR ${nvr.nvr_number} is offline — ${typeLabel} — ${failures} consecutive failures`,
          source:      nvr.nvr_type === 'software' ? 'nvr-http-monitor' : 'nvr-monitor',
        });
        io.emit('noc:alert', alert);

        // ── Failover: if primary goes offline and has a standby, emit failover trigger ──
        if (!nvr.is_failover && nvr.failover_nvr_id) {
          io.emit('nvr:failover_trigger', {
            primary_id:  nvr._id,
            standby_id:  nvr.failover_nvr_id,
            nvr_number:  nvr.nvr_number,
            triggered_at: now,
          });
        }
      }
    } else if (failures < FAIL_THRESHOLD) {
      update.status = nvr.status;
    }
  }

  // Predicted full date (hardware only — software uses cloud/NAS)
  if (update.status === 'online' && nvr.nvr_type !== 'software') {
    const totalCap  = nvr.hdd_slots?.length
      ? nvr.hdd_slots.reduce((s, d) => s + (d.capacity_tb || 0), 0)
      : (nvr.hdd_capacity_tb || 0);
    const totalUsed = nvr.hdd_slots?.length
      ? nvr.hdd_slots.reduce((s, d) => s + (d.used_tb || 0), 0)
      : (nvr.hdd_used_tb || 0);
    const freeGb = (totalCap - totalUsed) * 1024;
    if (nvr.daily_write_gb > 0 && freeGb > 0) {
      update.days_until_full = Math.floor(freeGb / nvr.daily_write_gb);
    }

    // ── AI: HDD failure prediction per slot ──────────────────────────────
    if (nvr.hdd_slots?.length) {
      let worstRisk = 'low';
      const riskOrder = ['low','medium','high','critical'];
      for (const slot of nvr.hdd_slots) {
        const pred = predictHddFailure(slot);
        slot.ai_risk       = pred.risk;
        slot.ai_risk_score = pred.score;
        slot.ai_risk_reason = pred.reason;
        if (riskOrder.indexOf(pred.risk) > riskOrder.indexOf(worstRisk)) worstRisk = pred.risk;

        // Raise NOC alert for high/critical risk
        if (pred.risk === 'high' || pred.risk === 'critical') {
          const existing = await NocAlert.exists({
            description: { $regex: `${nvr.nvr_number}.*HDD.*Slot ${slot.slot}.*AI` },
            resolved_at: null,
          });
          if (!existing) {
            const alert = await NocAlert.create({
              severity: pred.risk === 'critical' ? 'critical' : 'warning',
              company:  nvr.company,
              description: `🤖 AI: NVR ${nvr.nvr_number} HDD Slot ${slot.slot} — ${pred.risk.toUpperCase()} failure risk (score ${pred.score}/100). ${pred.reason}`,
              source: 'ai-hdd-prediction',
            });
            io.emit('noc:alert', alert);
          }
        }
      }
      update.hdd_slots    = nvr.hdd_slots;
      update.ai_hdd_risk  = worstRisk;
    }
  }

  await Nvr.findByIdAndUpdate(nvr._id, update);
  io.emit('nvr:health_update', { nvr_id: nvr._id, nvr_number: nvr.nvr_number, nvr_type: nvr.nvr_type, ...update });
}

function startNvrMonitoring(io) {
  setInterval(async () => {
    const nvrs = await Nvr.find({
      $or: [
        { nvr_type: 'hardware', ip_address: { $exists: true, $ne: null }, status: { $ne: 'not_installed' } },
        { nvr_type: 'software', health_endpoint: { $exists: true, $ne: null } },
      ]
    }).lean().catch(() => []);

    for (const nvr of nvrs) {
      checkNvr(nvr, io).catch(() => {});
    }
  }, INTERVAL_MS);
}

module.exports = { startNvrMonitoring };
