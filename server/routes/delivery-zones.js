const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

// The DB unique key (tenantId, branchId, name) does not catch branchId null rows
// (Postgres treats NULLs as distinct), so store-wide areas need an explicit check.
async function findDuplicateZone(tenantId, name, branchId, excludeId) {
    const zoneName = String(name || '').trim();
    if (!zoneName) return null;
    return prisma.deliveryZone.findFirst({
        where: {
            tenantId,
            branchId: branchId || null,
            name: { equals: zoneName, mode: 'insensitive' },
            ...(excludeId ? { id: { not: excludeId } } : {})
        }
    });
}

const DUPLICATE_ZONE_MESSAGE = 'توجد منطقة توصيل بنفس الاسم بالفعل لهذا الفرع.';

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
        const zoneName = String(name || '').trim();
        if (!zoneName) return res.status(400).json({ error: 'Zone name is required' });

        if (await findDuplicateZone(req.tenantId, zoneName, branchId)) {
            return res.status(409).json({ error: DUPLICATE_ZONE_MESSAGE });
        }

        const newZone = await prisma.deliveryZone.create({
            data: {
                tenantId: req.tenantId,
                branchId: branchId || null,
                name: zoneName,
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

        // Renaming or moving a zone must not collide with another zone of the same tenant/branch.
        const nextName = name !== undefined ? String(name || '').trim() : zone.name;
        if (!nextName) return res.status(400).json({ error: 'Zone name is required' });
        const nextBranchId = branchId !== undefined ? (branchId || null) : zone.branchId;
        if (await findDuplicateZone(req.tenantId, nextName, nextBranchId, zone.id)) {
            return res.status(409).json({ error: DUPLICATE_ZONE_MESSAGE });
        }

        const updated = await prisma.deliveryZone.update({
            where: { id: req.params.id },
            data: {
                name: name !== undefined ? nextName : undefined,
                fee: fee !== undefined ? parseFloat(fee) : undefined,
                branchId: branchId !== undefined ? nextBranchId : undefined,
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
