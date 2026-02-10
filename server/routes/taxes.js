const express = require('express');
const router = express.Router();
const Tax = require('../models/Tax');

// GET /api/taxes - List all taxes
router.get('/', async (req, res) => {
    try {
        const { enabled, branchId } = req.query;
        let query = {};

        if (enabled === 'true') query.enabled = true;

        // Branch filtering logic (if needed in future)
        if (branchId) {
            query.$or = [
                { branchId: null }, // Global taxes
                { branchId: branchId }
            ];
        }

        const taxes = await Tax.find(query).sort({ createdAt: -1 });
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

        const newTax = new Tax({
            name,
            percentage,
            enabled: enabled !== undefined ? enabled : true,
            orderTypes: orderTypes || ['dine_in', 'take_away', 'delivery'],
            branchId: branchId || null
        });

        const savedTax = await newTax.save();
        res.status(201).json(savedTax);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/taxes/:id - Update tax
router.put('/:id', async (req, res) => {
    try {
        const { name, percentage, enabled, branchId, orderTypes } = req.body;

        const updatedTax = await Tax.findByIdAndUpdate(
            req.params.id,
            {
                name,
                percentage,
                enabled,
                orderTypes,
                branchId,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!updatedTax) return res.status(404).json({ error: 'Tax not found' });
        res.json(updatedTax);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/taxes/:id - Delete tax
router.delete('/:id', async (req, res) => {
    try {
        const deletedTax = await Tax.findByIdAndDelete(req.params.id);
        if (!deletedTax) return res.status(404).json({ error: 'Tax not found' });
        res.json({ message: 'Tax deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
