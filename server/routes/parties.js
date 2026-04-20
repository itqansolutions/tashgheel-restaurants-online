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
            // Verify ownership before updating
            const existing = await prisma.vendor.findUnique({ where: { id } });
            if (existing && existing.tenantId !== tenantId) {
                return res.status(403).json({ error: 'Access denied to this vendor' });
            }

            if (existing) {
                vendor = await prisma.vendor.update({
                    where: { id },
                    data: {
                        name: data.name,
                        mobile: data.mobile,
                        address: data.address,
                        credit: parseFloat(data.credit) || 0,
                        updatedAt: new Date()
                    }
                });
            } else {
                vendor = await prisma.vendor.create({
                    data: {
                        id: id.length === 36 ? id : undefined,
                        name: data.name,
                        mobile: data.mobile,
                        address: data.address,
                        credit: parseFloat(data.credit) || 0,
                        tenantId,
                        branchId
                    }
                });
            }
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
            const existing = await prisma.customer.findUnique({ where: { id } });
            if (existing && existing.tenantId !== tenantId) {
                return res.status(403).json({ error: 'Access denied to this customer' });
            }

            if (existing) {
                customer = await prisma.customer.update({
                    where: { id },
                    data: {
                        name: data.name,
                        mobile: data.mobile,
                        notes: data.notes,
                        addresses: data.addresses,
                        loyaltyPoints: parseInt(data.loyaltyPoints) || 0,
                        updatedAt: new Date()
                    }
                });
            } else {
                customer = await prisma.customer.create({
                    data: {
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
            }
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
