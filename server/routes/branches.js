const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const auth = require('../middleware/auth');

// Apply Auth Middleware to ALL routes in this file
router.use(auth);

// Never send stored delivery-app keys to the browser.
function publicBranch(b) {
    if (!b || !b.settings || !b.settings.aggregators) return b;
    const aggregators = {};
    for (const [k, v] of Object.entries(b.settings.aggregators)) {
        const { encryptedCredentials, ...rest } = v || {};
        aggregators[k] = { ...rest, hasCredentials: !!encryptedCredentials };
    }
    return { ...b, settings: { ...b.settings, aggregators } };
}

// @route   GET /api/branches
router.get('/', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            where: { tenantId: req.tenantId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(branches.map(publicBranch));
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

        res.json(publicBranch(branch));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   PATCH /api/branches/:id
// Rename a branch. Name only: the rest of the branch (settings, codes) is edited
// elsewhere, and the staff UI has no rename screen yet - this is the API path.
router.patch('/:id', async (req, res) => {
    try {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        if (!name) return res.status(400).json({ msg: 'Branch name is required' });
        if (name.length > 80) return res.status(400).json({ msg: 'Branch name is too long' });

        const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
        if (!branch || branch.tenantId !== req.tenantId) return res.status(404).json({ msg: 'Branch not found' });

        const updated = await prisma.branch.update({ where: { id: branch.id }, data: { name } });
        res.json(publicBranch(updated));
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

