const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

// --- VENDORS ROUTES ---
router.get('/vendors', async (req, res) => {
    try {
        const { tenantId } = req;
        const vendors = await prisma.vendor.findMany({
            where: { tenantId }
        });
        res.json(vendors);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/vendors', async (req, res) => {
    try {
        const { tenantId, branchId } = req;
        const data = req.body;
        const id = data.id || data._id;

        let vendor;
        if (id) {
            vendor = await prisma.vendor.upsert({
                where: { id },
                update: {
                    name: data.name,
                    mobile: data.mobile,
                    address: data.address,
                    credit: parseFloat(data.credit) || 0,
                    updatedAt: new Date()
                },
                create: {
                    id: id.length === 36 ? id : undefined, // Ensure it's a UUID if provided, else let Prisma generate
                    name: data.name,
                    mobile: data.mobile,
                    address: data.address,
                    credit: parseFloat(data.credit) || 0,
                    tenantId,
                    branchId
                }
            });
        } else {
            vendor = await prisma.vendor.create({
                data: {
                    name: data.name,
                    mobile: data.mobile,
                    address: data.address,
                    credit: parseFloat(data.credit) || 0,
                    tenantId,
                    branchId
                }
            });
        }
        res.json(vendor);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/vendors/:id', async (req, res) => {
    try {
        await prisma.vendor.deleteMany({
            where: { id: req.params.id, tenantId: req.tenantId }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- CUSTOMERS ROUTES ---
router.get('/customers', async (req, res) => {
    try {
        const { tenantId } = req;
        const customers = await prisma.customer.findMany({
            where: { tenantId }
        });
        res.json(customers);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/customers', async (req, res) => {
    try {
        const { tenantId, branchId } = req;
        const data = req.body;
        const id = data.id || data._id;

        let customer;
        if (id) {
            customer = await prisma.customer.upsert({
                where: { id },
                update: {
                    name: data.name,
                    mobile: data.mobile,
                    notes: data.notes,
                    addresses: data.addresses,
                    loyaltyPoints: parseInt(data.loyaltyPoints) || 0,
                    updatedAt: new Date()
                },
                create: {
                    id: id.length === 36 ? id : undefined,
                    name: data.name,
                    mobile: data.mobile,
                    notes: data.notes,
                    addresses: data.addresses,
                    loyaltyPoints: parseInt(data.loyaltyPoints) || 0,
                    tenantId,
                    branchId
                }
            });
        } else {
            customer = await prisma.customer.create({
                data: {
                    name: data.name,
                    mobile: data.mobile,
                    notes: data.notes,
                    addresses: data.addresses,
                    loyaltyPoints: parseInt(data.loyaltyPoints) || 0,
                    tenantId,
                    branchId
                }
            });
        }
        res.json(customer);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/customers/:id', async (req, res) => {
    try {
        await prisma.customer.deleteMany({
            where: { id: req.params.id, tenantId: req.tenantId }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

module.exports = router;
