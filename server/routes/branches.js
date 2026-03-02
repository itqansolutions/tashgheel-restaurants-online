const express = require('express');
const router = express.Router();
const Branch = require('../models/Branch');
const Order = require('../models/Order');
const auth = require('../middleware/auth');


// Apply Auth Middleware to ALL routes in this file
router.use(auth);

// @route   GET /api/branches
// @desc    Get all branches for the current tenant
router.get('/', async (req, res) => {
    try {
        const branches = await Branch.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
        res.json(branches);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   POST /api/branches
// @desc    Create a new branch
router.post('/', async (req, res) => {
    try {
        const { name, code, phone, address, settings } = req.body;

        // Check if branch code exists for this tenant
        const existingBranch = await Branch.findOne({ tenantId: req.tenantId, code });
        if (existingBranch) {
            return res.status(400).json({ msg: 'Branch code already exists' });
        }

        const newBranch = new Branch({
            tenantId: req.tenantId,
            name,
            code,
            phone,
            address,
            settings: settings || {}
        });

        const branch = await newBranch.save();
        res.json(branch);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   DELETE /api/branches/:id
// @desc    Delete a branch — blocked if active dine-in orders exist
router.delete('/:id', async (req, res) => {
    try {
        const branch = await Branch.findOne({ _id: req.params.id, tenantId: req.tenantId });
        if (!branch) return res.status(404).json({ msg: 'Branch not found' });

        // Guard: cannot delete branch with open dine-in orders
        const hasOpenOrders = await Order.exists({ branchId: req.params.id, status: 'open' });
        if (hasOpenOrders) {
            return res.status(409).json({
                msg: 'This branch has active dine-in orders. Close all table bills before deleting the branch.'
            });
        }

        await Branch.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
        res.json({ msg: 'Branch removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;

