const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

// GET /api/delivery-zones
router.get('/', async (req, res) => {
    try {
        const zones = await prisma.deliveryZone.findMany({
            where: { tenantId: req.tenantId }
        });
        res.json(zones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/delivery-zones
router.post('/', async (req, res) => {
    try {
        const { name, fee, branchId, coordinates } = req.body;
        const newZone = await prisma.deliveryZone.create({
            data: {
                tenantId: req.tenantId,
                branchId: branchId || null,
                name,
                fee: parseFloat(fee) || 0,
                coordinates: coordinates || null
            }
        });
        res.json(newZone);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/delivery-zones/:id
router.put('/:id', async (req, res) => {
    try {
        const { name, fee, branchId, coordinates, isActive } = req.body;
        const zone = await prisma.deliveryZone.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId }
        });
        if (!zone) {
            return res.status(404).json({ error: 'Delivery zone not found' });
        }

        const updated = await prisma.deliveryZone.update({
            where: { id: req.params.id },
            data: {
                name: name !== undefined ? name : undefined,
                fee: fee !== undefined ? parseFloat(fee) : undefined,
                branchId: branchId !== undefined ? branchId : undefined,
                coordinates: coordinates !== undefined ? coordinates : undefined,
                isActive: isActive !== undefined ? isActive : undefined
            }
        });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/delivery-zones/:id
router.delete('/:id', async (req, res) => {
    try {
        await prisma.deliveryZone.deleteMany({
            where: { id: req.params.id, tenantId: req.tenantId }
        });
        res.json({ success: true, message: 'Delivery zone deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/delivery-zones/migrate
router.post('/migrate', async (req, res) => {
    try {
        const { areas } = req.body; 
        if (!areas || !Array.isArray(areas)) return res.status(400).json({ error: 'Invalid data' });

        let count = 0;
        for (const area of areas) {
            const exists = await prisma.deliveryZone.findFirst({
                where: {
                    tenantId: req.tenantId,
                    name: area.name
                }
            });

            if (!exists) {
                await prisma.deliveryZone.create({
                    data: {
                        tenantId: req.tenantId,
                        name: area.name,
                        fee: parseFloat(area.fee) || 0
                    }
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
