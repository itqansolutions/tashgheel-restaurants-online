const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

// GET /api/taxes - List all taxes
router.get('/', async (req, res) => {
    try {
        const { enabled, branchId } = req.query;
        let filter = { tenantId: req.tenantId }; // STRICT Isolation

        if (enabled === 'true') filter.enabled = true;

        if (branchId && branchId !== 'all') {
            filter.OR = [
                { branchId: null }, // Global taxes
                { branchId: branchId }
            ];
        }

        const taxes = await prisma.tax.findMany({
            where: filter,
            orderBy: { createdAt: 'desc' }
        });
        res.json(taxes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/taxes - Create new tax
router.post('/', async (req, res) => {
    try {
        const { name, percentage, enabled, branchId, orderTypes } = req.body;

        if (!name || percentage === undefined) {
            return res.status(400).json({ error: 'Name and Percentage are required' });
        }

        const tax = await prisma.tax.create({
            data: {
                name,
                percentage: parseFloat(percentage),
                enabled: enabled !== undefined ? enabled : true,
                orderTypes: Array.isArray(orderTypes) ? orderTypes : ['dine_in', 'take_away', 'delivery'],
                branchId: branchId || null,
                tenantId: req.tenantId
            }
        });

        res.status(201).json(tax);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/taxes/:id - Update tax
router.put('/:id', async (req, res) => {
    try {
        const { name, percentage, enabled, branchId, orderTypes } = req.body;

        const tax = await prisma.tax.findUnique({ 
            where: { id: req.params.id } 
        });
        
        if (!tax || tax.tenantId !== req.tenantId) {
            return res.status(404).json({ error: 'Tax not found or access denied' });
        }

        const updatedTax = await prisma.tax.update({
            where: { id: req.params.id },
            data: {
                name,
                percentage: percentage !== undefined ? parseFloat(percentage) : undefined,
                enabled: enabled !== undefined ? enabled : undefined,
                orderTypes: Array.isArray(orderTypes) ? orderTypes : undefined,
                branchId: branchId || undefined
            }
        });

        res.json(updatedTax);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/taxes/:id - Delete tax
router.delete('/:id', async (req, res) => {
    try {
        const tax = await prisma.tax.findUnique({ 
            where: { id: req.params.id } 
        });
        
        if (!tax || tax.tenantId !== req.tenantId) {
            return res.status(404).json({ error: 'Tax not found or access denied' });
        }

        await prisma.tax.delete({ where: { id: req.params.id } });
        res.json({ message: 'Tax deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
