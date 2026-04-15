/**
 * AI Engine — ManMove NOC & NVR Intelligence
 * Uses OpenAI GPT-4o-mini for classification tasks
 * Uses statistical models for prediction tasks (no GPU needed)
 */

// ── 1. Fault Auto-Classification (rule-based, no API needed) ─────────────
const FAULT_RULES = [
  { keywords: ['black','no video','no image','blank','no display'],          fault_type: 'No Video',             priority: 'high',   root_cause: 'Stream or channel configuration issue', suggested_resolution: 'reconfigured' },
  { keywords: ['blur','blurry','foggy','unclear','out of focus','hazy'],     fault_type: 'Blurry Image',         priority: 'medium', root_cause: 'Dirty lens or focus drift',             suggested_resolution: 'cleaned' },
  { keywords: ['night','dark','ir','infrared','no night','night vision'],    fault_type: 'Night Vision Failure', priority: 'medium', root_cause: 'IR LED failure or day/night filter stuck', suggested_resolution: 'repaired' },
  { keywords: ['ptz','pan','tilt','zoom','rotate','motor','not moving'],     fault_type: 'PTZ Not Working',      priority: 'high',   root_cause: 'RS485 cable or PTZ protocol mismatch',  suggested_resolution: 'reconfigured' },
  { keywords: ['offline','not reachable','ping','unreachable','down'],       fault_type: 'Camera Offline',       priority: 'high',   root_cause: 'Network or power failure',              suggested_resolution: 'cable_fixed' },
  { keywords: ['damage','broken','vandal','smashed','crack','physical'],     fault_type: 'Physical Damage',      priority: 'critical', root_cause: 'Physical impact or vandalism',        suggested_resolution: 'replaced' },
  { keywords: ['water','wet','rain','flood','moisture','ingress'],           fault_type: 'Water Ingress',        priority: 'critical', root_cause: 'Weatherproofing failure',             suggested_resolution: 'replaced' },
  { keywords: ['power','electric','no power','voltage','fuse','ups','poe'],  fault_type: 'Power Issue',          priority: 'high',   root_cause: 'Power supply or PoE failure',           suggested_resolution: 'power_fixed' },
  { keywords: ['cable','wire','cut','loose','connector','junction'],         fault_type: 'Cable Fault',          priority: 'high',   root_cause: 'Cable damage or loose connection',      suggested_resolution: 'cable_fixed' },
  { keywords: ['nvr','channel','recording','not recording','dvr'],           fault_type: 'NVR Channel Lost',     priority: 'high',   root_cause: 'NVR channel misconfiguration',          suggested_resolution: 'reconfigured' },
  { keywords: ['led','ir led','light','lamp'],                               fault_type: 'IR LED Failure',       priority: 'medium', root_cause: 'IR LED array burned out',               suggested_resolution: 'repaired' },
  { keywords: ['dirty','dust','clean','spider','web','bird'],                fault_type: 'Lens Dirty',           priority: 'low',    root_cause: 'Lens contamination',                   suggested_resolution: 'cleaned' },
];

function classifyFault(description) {
    if (!description) return null;
    const lower = description.toLowerCase();
    for (const rule of FAULT_RULES) {
        if (rule.keywords.some(k => lower.includes(k))) {
            return { fault_type: rule.fault_type, priority: rule.priority, root_cause: rule.root_cause, suggested_resolution: rule.suggested_resolution };
        }
    }
    return { fault_type: 'Other', priority: 'medium', root_cause: 'Manual investigation required', suggested_resolution: 'other' };
}

// ── 2. HDD Failure Prediction (statistical — SMART data) ─────────────────
// Returns: { risk: 'low'|'medium'|'high'|'critical', score: 0-100, reason }
function predictHddFailure(slot) {
    let score = 0;
    const reasons = [];

    // Temperature scoring
    if (slot.temperature_c > 60)      { score += 40; reasons.push(`Critical temp ${slot.temperature_c}°C`); }
    else if (slot.temperature_c > 55) { score += 25; reasons.push(`High temp ${slot.temperature_c}°C`); }
    else if (slot.temperature_c > 45) { score += 10; reasons.push(`Elevated temp ${slot.temperature_c}°C`); }

    // Reallocated sectors (most reliable failure indicator)
    if (slot.reallocated_sectors > 100)  { score += 40; reasons.push(`${slot.reallocated_sectors} reallocated sectors`); }
    else if (slot.reallocated_sectors > 10) { score += 20; reasons.push(`${slot.reallocated_sectors} reallocated sectors`); }
    else if (slot.reallocated_sectors > 0)  { score += 5; }

    // Power-on hours (age)
    if (slot.power_on_hours > 50000)     { score += 20; reasons.push('Drive age >5.7 years'); }
    else if (slot.power_on_hours > 35000) { score += 10; reasons.push('Drive age >4 years'); }

    // Current health status
    if (slot.health_status === 'failing') { score += 30; reasons.push('SMART status: failing'); }
    if (slot.health_status === 'failed')  { score = 100; reasons.push('SMART status: failed'); }

    // Usage ratio
    const usageRatio = slot.capacity_tb > 0 ? slot.used_tb / slot.capacity_tb : 0;
    if (usageRatio > 0.95) { score += 10; reasons.push('Storage >95% full'); }

    score = Math.min(score, 100);
    const risk = score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low';
    return { risk, score, reason: reasons.join('; ') || 'Normal operation' };
}

// ── 3. Anomaly Detection — camera uptime pattern ──────────────────────────
// Input: array of health records (last 24h), sorted oldest→newest
// Output: { anomaly: bool, pattern: string, type: string }
function detectUptimeAnomaly(healthRecords) {
    if (healthRecords.length < 10) return { anomaly: false };

    const offlineRecords = healthRecords.filter(r => r.status === 'offline');
    const offlineRatio = offlineRecords.length / healthRecords.length;

    // Pattern: goes offline at same hour repeatedly
    const offlineHours = offlineRecords.map(r => new Date(r.checked_at).getHours());
    const hourCounts = {};
    offlineHours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
    const maxHourCount = Math.max(...Object.values(hourCounts), 0);
    const peakHour = Object.keys(hourCounts).find(h => hourCounts[h] === maxHourCount);

    if (maxHourCount >= 3 && offlineRatio < 0.5) {
        return { anomaly: true, type: 'scheduled_outage', pattern: `Camera goes offline repeatedly around ${peakHour}:00 — likely power schedule or NVR reboot` };
    }

    // Pattern: intermittent (flapping) — online/offline alternating rapidly
    let flaps = 0;
    for (let i = 1; i < healthRecords.length; i++) {
        if (healthRecords[i].status !== healthRecords[i-1].status) flaps++;
    }
    if (flaps > healthRecords.length * 0.4) {
        return { anomaly: true, type: 'flapping', pattern: 'Camera status flapping — likely loose cable or unstable power' };
    }

    // Pattern: latency spike before going offline
    const latencies = healthRecords.filter(r => r.latency_ms).map(r => r.latency_ms);
    if (latencies.length > 5) {
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const recent = latencies.slice(-3).reduce((a, b) => a + b, 0) / 3;
        if (recent > avg * 3) {
            return { anomaly: true, type: 'latency_spike', pattern: `Latency spiking (avg ${Math.round(avg)}ms → recent ${Math.round(recent)}ms) — network congestion or hardware degrading` };
        }
    }

    return { anomaly: false };
}

// ── 4. Storage Full Prediction (weighted moving average) ──────────────────
// More accurate than simple linear — weights recent days more heavily
// Input: array of { date, used_tb } daily snapshots
// Output: { days_until_full, confidence: 'high'|'medium'|'low' }
function predictStorageFull(dailySnapshots, capacity_tb) {
    if (!dailySnapshots || dailySnapshots.length < 3 || !capacity_tb) return null;

    const sorted = [...dailySnapshots].sort((a, b) => new Date(a.date) - new Date(b.date));
    const n = sorted.length;

    // Weighted daily write rates — recent days get higher weight
    let weightedRate = 0, totalWeight = 0;
    for (let i = 1; i < n; i++) {
        const delta = sorted[i].used_tb - sorted[i-1].used_tb;
        if (delta <= 0) continue;
        const weight = i; // more recent = higher index = higher weight
        weightedRate += delta * weight;
        totalWeight += weight;
    }

    if (totalWeight === 0) return null;
    const dailyWriteTb = weightedRate / totalWeight;
    if (dailyWriteTb <= 0) return null;

    const freeTb = capacity_tb - sorted[n-1].used_tb;
    const days_until_full = Math.floor(freeTb / dailyWriteTb);
    const confidence = n >= 14 ? 'high' : n >= 7 ? 'medium' : 'low';

    return { days_until_full, daily_write_tb: +dailyWriteTb.toFixed(4), confidence };
}

module.exports = { classifyFault, predictHddFailure, detectUptimeAnomaly, predictStorageFull };
