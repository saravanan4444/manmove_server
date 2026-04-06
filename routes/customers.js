const express   = require('express');
const router    = express.Router();
const customers = require('../models/customers');
const { authenticate, scopeToTenant, permitMatrix } = require('../config/authMiddleware');

router.get('/allcustomers', authenticate, scopeToTenant, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const skip  = parseInt(req.query.skip) || 0;
        const query = Object.assign({}, req.query); delete query.limit; delete query.skip;
        const data  = await customers.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).lean();
        res.status(200).json({ status: 200, data });
    } catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.post('/addcustomer', authenticate, permitMatrix('customers', 'create'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await customers.create(req.body) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

router.put('/customer/:id', authenticate, permitMatrix('customers', 'update'), async (req, res) => {
    try { res.status(200).json({ status: 200, data: await customers.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
    catch (err) { res.status(200).json({ status: 500, message: err.message }); }
});

module.exports = router;
