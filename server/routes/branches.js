const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const auth = require('../middleware/auth');

// Apply Auth Middleware to ALL routes in this file
router.use(auth);

// @route   GET /api/branches
router.get('/', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            where: { tenantId: req.tenantId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(branches);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   POST /api/branches
router.post('/', async (req, res) => {
    try {
        const { name, code, phone, address, settings } = req.body;

        const existingBranch = await prisma.branch.findFirst({
            where: { tenantId: req.tenantId, code }
        });
        if (existingBranch) {
            return res.status(400).json({ msg: 'Branch code already exists' });
        }

        const branch = await prisma.branch.create({
            data: {
                tenantId: req.tenantId,
                name,
                code,
                phone,
                address,
                settings: settings || {}
            }
        });

        res.json(branch);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   DELETE /api/branches/:id
router.delete('/:id', async (req, res) => {
    try {
        const branch = await prisma.branch.findUnique({
            where: { id: req.params.id }
        });
        
        if (!branch || branch.tenantId !== req.tenantId) {
            return res.status(404).json({ msg: 'Branch not found' });
        }

        const hasOpenOrders = await prisma.order.findFirst({
            where: { branchId: req.params.id, status: 'open' }
        });
        
        if (hasOpenOrders) {
            return res.status(409).json({
                msg: 'This branch has active dine-in orders. Close all table bills before deleting the branch.'
            });
        }

        await prisma.branch.delete({
            where: { id: req.params.id }
        });
        
        res.json({ msg: 'Branch removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;

