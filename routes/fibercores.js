const express = require('express');
const router  = express.Router();
const CoreAllocation = require('../models/coreallocation');
const { authenticate, requireSuperadmin, SUPERADMIN_ROLES } = require('../config/authMiddleware');

const isOwner = (req) => SUPERADMIN_ROLES.includes(req.user?.role) || !req.user?.company;

// ── Get core allocations for a route ─────────────────────────────────────────
// Owner sees all cores. Client sees only their allocated cores (other companies masked).
router.get('/fibercores/:routeId', authenticate, async (req, res) => {
  try {
    const cores = await CoreAllocation.find({ route_id: req.params.routeId }).sort({ core_number: 1 }).lean();

    if (isOwner(req)) {
      return res.json({ status: 200, data: cores });
    }

    // Client: return all cores but mask other companies' data
    const company = req.user.company;
    const scoped = cores.map(c => {
      if (c.allocated_to === company) return c; // full data for their own cores
      return {
        _id: c._id,
        route_id: c.route_id,
        core_number: c.core_number,
        allocation_type: c.allocation_type,
        allocated_to: c.allocated_to === 'spare' ? 'spare' : 'allocated', // mask company name
        status: c.status,
        owner_company: c.owner_company,
      };
    });
    res.json({ status: 200, data: scoped });
  } catch (err) { res.json({ status: 500, message: err.message }); }
});

// ── Save/update core allocations for a route (owner only) ────────────────────
router.post('/fibercores/:routeId', authenticate, async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ status: 403, message: 'Only infra owner can allocate cores' });
  try {
    const { cores } = req.body; // array of { core_number, allocated_to, allocation_type, ... }
    const ops = cores.map((c) => ({
      updateOne: {
        filter: { route_id: req.params.routeId, core_number: c.core_number },
        update: { $set: { ...c, route_id: req.params.routeId, owner_company: req.user.company || 'serans' } },
        upsert: true,
      }
    }));
    await CoreAllocation.bulkWrite(ops);
    res.json({ status: 200, message: 'Core allocations saved' });
  } catch (err) { res.json({ status: 500, message: err.message }); }
});

// ── Get all routes where a company has allocated cores ────────────────────────
router.get('/fibercompanyroutes', authenticate, async (req, res) => {
  try {
    const company = isOwner(req) ? (req.query.company || null) : req.user.company;
    const query = company ? { allocated_to: company } : {};
    const allocs = await CoreAllocation.find(query).distinct('route_id');
    res.json({ status: 200, routeIds: allocs.map(String) });
  } catch (err) { res.json({ status: 500, message: err.message }); }
});

// ── Revenue summary (owner only) ─────────────────────────────────────────────
router.get('/fiberrevenue', authenticate, async (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ status: 403, message: 'Forbidden' });
  try {
    const leases = await CoreAllocation.find({ allocation_type: 'lease', status: 'active' }).lean();
    const byCompany = leases.reduce((acc, c) => {
      if (!acc[c.allocated_to]) acc[c.allocated_to] = { company: c.allocated_to, cores: 0, monthly_rent: 0 };
      acc[c.allocated_to].cores++;
      acc[c.allocated_to].monthly_rent += c.monthly_rent || 0;
      return acc;
    }, {});
    const total_monthly = leases.reduce((s, c) => s + (c.monthly_rent || 0), 0);
    res.json({ status: 200, data: Object.values(byCompany), total_monthly });
  } catch (err) { res.json({ status: 500, message: err.message }); }
});

module.exports = router;
