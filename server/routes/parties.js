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

// GET /parties/vendors/:id/transactions — vendor ledger rows
router.get('/vendors/:id/transactions', async (req, res) => {
    try {
        const vendorId = req.params.id;
        const vendorTxKey = `vendor_transactions_${vendorId}`;
        const data = await prisma.data.findUnique({
            where: { key_tenantId: { key: vendorTxKey, tenantId: req.tenantId } }
        });
        if (!data) return res.json([]);
        const transactions = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        res.json(Array.isArray(transactions) ? transactions : []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /parties/vendors/:id/transactions — manual payment against a vendor
router.post('/vendors/:id/transactions', async (req, res) => {
    try {
        const vendorId = req.params.id;
        const { type, amount, description, method, date, notes } = req.body;

        if (!type || !amount || amount <= 0) {
            return res.status(400).json({ error: 'type and amount are required' });
        }

        const vendorTxKey = `vendor_transactions_${vendorId}`;
        const today = date || new Date().toISOString().split('T')[0];

        await prisma.$transaction(async (tx) => {
            const existing = await tx.data.findUnique({
                where: { key_tenantId: { key: vendorTxKey, tenantId: req.tenantId } }
            });
            let transactions = existing
                ? (typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value)
                : [];
            if (!Array.isArray(transactions)) transactions = [];

            transactions.push({
                id: `${Date.now()}-${type}`,
                vendorId,
                type,
                amount: parseFloat(amount),
                description: description || (type === 'payment' ? 'Manual Payment' : 'Manual Purchase'),
                date: today,
                method: method || 'cash',
                notes: notes || null,
                createdAt: new Date().toISOString()
            });

            await tx.data.upsert({
                where: { key_tenantId: { key: vendorTxKey, tenantId: req.tenantId } },
                update: { value: JSON.stringify(transactions), updatedAt: new Date() },
                create: { key: vendorTxKey, tenantId: req.tenantId, value: JSON.stringify(transactions) }
            });

            // Update vendor credit balance
            const delta = type === 'purchase' ? parseFloat(amount) : -parseFloat(amount);
            await tx.vendor.updateMany({
                where: { id: vendorId, tenantId: req.tenantId },
                data: { credit: { increment: delta } }
            });
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
