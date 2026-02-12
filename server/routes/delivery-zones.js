const express = require('express');
const router = express.Router();
const DeliveryZone = require('../models/DeliveryZone');

// GET /api/delivery-zones
router.get('/', async (req, res) => {
    try {
        const zones = await DeliveryZone.find({ tenantId: req.user.tenantId });
        res.json(zones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/delivery-zones
router.post('/', async (req, res) => {
    try {
        const { name, fee, branchId } = req.body;
        const newZone = new DeliveryZone({
            tenantId: req.user.tenantId,
            branchId: branchId || null, // Optional
            name,
            fee
        });
        await newZone.save();
        res.json(newZone);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/delivery-zones/:id
router.delete('/:id', async (req, res) => {
    try {
        await DeliveryZone.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/delivery-zones/migrate
// One-time migration endpoint
router.post('/migrate', async (req, res) => {
    try {
        const { areas } = req.body; // Expect array of {name, fee}
        if (!areas || !Array.isArray(areas)) return res.status(400).json({ error: 'Invalid data' });

        let count = 0;
        for (const area of areas) {
            // Check existence
            const exists = await DeliveryZone.findOne({
                tenantId: req.user.tenantId,
                name: area.name
            });

            if (!exists) {
                await DeliveryZone.create({
                    tenantId: req.user.tenantId,
                    name: area.name,
                    fee: area.fee || 0
                });
                count++;
            }
        }
        res.json({ success: true, migrated: count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
