const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

// --- VENDORS ROUTES ---
router.get('/vendors', async (req, res) => {
    try {
        const { tenantId } = req;
        let vendors = await prisma.vendor.findMany({
            where: { tenantId }
        });

        // Auto-reconciliation: ensure vendor credit reflects actual ledger transactions or raw material stock
        if (Array.isArray(vendors) && vendors.length > 0) {
            let ingredients = [];
            try {
                const ingData = await prisma.data.findUnique({
                    where: { key_tenantId: { key: 'ingredients', tenantId } }
                });
                if (ingData && ingData.value) {
                    const parsed = typeof ingData.value === 'string' ? JSON.parse(ingData.value) : ingData.value;
                    if (Array.isArray(parsed)) ingredients = parsed;
                }
            } catch (e) {}

            for (const v of vendors) {
                try {
                    const txKey = `vendor_transactions_${v.id}`;
                    let txData = await prisma.data.findUnique({
                        where: { key_tenantId: { key: txKey, tenantId } }
                    });
                    let transactions = [];
                    if (txData && txData.value) {
                        transactions = typeof txData.value === 'string' ? JSON.parse(txData.value) : txData.value;
                    }
                    if (!Array.isArray(transactions) || transactions.length === 0) {
                        const altTxKey = `vendor_transactions_${v.name}`;
                        const altData = await prisma.data.findUnique({
                            where: { key_tenantId: { key: altTxKey, tenantId } }
                        });
                        if (altData && altData.value) {
                            const parsedAlt = typeof altData.value === 'string' ? JSON.parse(altData.value) : altData.value;
                            if (Array.isArray(parsedAlt) && parsedAlt.length > 0) {
                                transactions = parsedAlt;
                            }
                        }
                    }

                    if (Array.isArray(transactions) && transactions.length > 0) {
                        const ledgerBalance = transactions.reduce((sum, t) => {
                            const amt = parseFloat(t.amount) || 0;
                            return t.type === 'payment' ? sum - amt : sum + amt;
                        }, 0);
                        if (Math.abs((parseFloat(v.credit) || 0) - ledgerBalance) > 0.01) {
                            await prisma.vendor.update({
                                where: { id: v.id },
                                data: { credit: ledgerBalance }
                            });
                            v.credit = ledgerBalance;
                        }
                    } else if ((parseFloat(v.credit) || 0) === 0 && ingredients.length > 0) {
                        // Check if raw materials in stock belong to this vendor
                        const matched = ingredients.filter(m =>
                            (m.vendorId == v.id || m.vendorId == v.name || (!m.vendorId && vendors.length === 1)) &&
                            (parseFloat(m.stock) > 0)
                        );
                        if (matched.length > 0) {
                            const totalStockCost = matched.reduce((sum, m) => {
                                return sum + (parseFloat(m.stock) || 0) * (parseFloat(m.cost) || 0);
                            }, 0);

                            if (totalStockCost > 0) {
                                const newTx = [{
                                    id: `${Date.now()}-stock-purchase`,
                                    vendorId: v.id,
                                    type: 'purchase',
                                    amount: totalStockCost,
                                    description: `Stock Purchase: ${matched.map(m => `${m.name} (${m.stock} ${m.unit || ''} × ${(parseFloat(m.cost) || 0).toFixed(2)})`).join(', ')}`,
                                    date: new Date().toISOString().split('T')[0],
                                    method: 'credit',
                                    createdAt: new Date().toISOString()
                                }];

                                await prisma.data.upsert({
                                    where: { key_tenantId: { key: txKey, tenantId } },
                                    update: { value: JSON.stringify(newTx), updatedAt: new Date() },
                                    create: { key: txKey, tenantId, value: JSON.stringify(newTx) }
                                });

                                await prisma.vendor.update({
                                    where: { id: v.id },
                                    data: { credit: totalStockCost }
                                });
                                v.credit = totalStockCost;

                                // Update vendorId in ingredients blob if needed
                                let updatedIng = false;
                                matched.forEach(m => {
                                    if (!m.vendorId) {
                                        m.vendorId = v.id;
                                        updatedIng = true;
                                    }
                                });
                                if (updatedIng) {
                                    await prisma.data.update({
                                        where: { key_tenantId: { key: 'ingredients', tenantId } },
                                        data: { value: JSON.stringify(ingredients), updatedAt: new Date() }
                                    });
                                }
                            }
                        }
                    }
                } catch (vSyncErr) {
                    console.warn(`[VendorSync] Error syncing vendor ${v.id}:`, vSyncErr.message);
                }
            }
        }

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
        let data = await prisma.data.findUnique({
            where: { key_tenantId: { key: vendorTxKey, tenantId: req.tenantId } }
        });

        let transactions = [];
        if (data && data.value) {
            transactions = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        }

        // Fallback: If no transactions found under the provided ID, check by vendor name or UUID
        if (!Array.isArray(transactions) || transactions.length === 0) {
            const vendor = await prisma.vendor.findFirst({
                where: {
                    tenantId: req.tenantId,
                    OR: [{ id: vendorId }, { name: vendorId }]
                }
            });
            if (vendor) {
                const altKey = vendor.id === vendorId ? `vendor_transactions_${vendor.name}` : `vendor_transactions_${vendor.id}`;
                const altData = await prisma.data.findUnique({
                    where: { key_tenantId: { key: altKey, tenantId: req.tenantId } }
                });
                if (altData && altData.value) {
                    const altTx = typeof altData.value === 'string' ? JSON.parse(altData.value) : altData.value;
                    if (Array.isArray(altTx) && altTx.length > 0) {
                        transactions = altTx;
                    }
                }

                // If still empty, check if ingredients exist in inventory for this vendor
                if (!Array.isArray(transactions) || transactions.length === 0) {
                    try {
                        const ingData = await prisma.data.findUnique({
                            where: { key_tenantId: { key: 'ingredients', tenantId: req.tenantId } }
                        });
                        if (ingData && ingData.value) {
                            const parsedIng = typeof ingData.value === 'string' ? JSON.parse(ingData.value) : ingData.value;
                            if (Array.isArray(parsedIng)) {
                                const matched = parsedIng.filter(m =>
                                    (m.vendorId == vendor.id || m.vendorId == vendor.name || !m.vendorId) &&
                                    (parseFloat(m.stock) > 0)
                                );
                                if (matched.length > 0) {
                                    const totalCost = matched.reduce((sum, m) => sum + (parseFloat(m.stock) || 0) * (parseFloat(m.cost) || 0), 0);
                                    if (totalCost > 0) {
                                        transactions = [{
                                            id: `${Date.now()}-stock-purchase`,
                                            vendorId: vendor.id,
                                            type: 'purchase',
                                            amount: totalCost,
                                            description: `Stock Purchase: ${matched.map(m => `${m.name} (${m.stock} ${m.unit || ''} × ${(parseFloat(m.cost) || 0).toFixed(2)})`).join(', ')}`,
                                            date: new Date().toISOString().split('T')[0],
                                            method: 'credit',
                                            createdAt: new Date().toISOString()
                                        }];
                                        await prisma.data.upsert({
                                            where: { key_tenantId: { key: `vendor_transactions_${vendor.id}`, tenantId: req.tenantId } },
                                            update: { value: JSON.stringify(transactions), updatedAt: new Date() },
                                            create: { key: `vendor_transactions_${vendor.id}`, tenantId: req.tenantId, value: JSON.stringify(transactions) }
                                        });
                                    }
                                }
                            }
                        }
                    } catch (ingErr) {}
                }
            }
        }

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
                where: {
                    tenantId: req.tenantId,
                    OR: [
                        { id: String(vendorId) },
                        { name: String(vendorId) }
                    ]
                },
                data: { credit: { increment: delta } }
            });

            // 💰 If this is a vendor payment, record it as an Expense so it appears on expenses.html
            if (type === 'payment') {
                try {
                    const vendor = await tx.vendor.findFirst({
                        where: {
                            tenantId: req.tenantId,
                            OR: [{ id: String(vendorId) }, { name: String(vendorId) }]
                        }
                    });

                    // Resolve a valid branchId for this tenant
                    let expBranchId = req.branchId || vendor?.branchId;
                    if (!expBranchId || expBranchId === 'default') {
                        const fallbackBranch = await tx.branch.findFirst({
                            where: { tenantId: req.tenantId },
                            select: { id: true }
                        });
                        expBranchId = fallbackBranch?.id || 'default';
                    }

                    await tx.expense.create({
                        data: {
                            description: description || `Vendor Payment: ${vendor?.name || vendorId}`,
                            amount: parseFloat(amount),
                            date: today,
                            seller: vendor?.name || String(vendorId),
                            method: method || 'cash',
                            notes: notes || null,
                            category: 'Raw Materials',
                            type: 'vendor_payment',
                            tenantId: req.tenantId,
                            branchId: expBranchId,
                            createdBy: req.userId || 'system'
                        }
                    });
                    console.log(`[VendorPayment] ✅ Expense recorded for ${vendor?.name || vendorId}: ${amount} EGP`);
                } catch (expErr) {
                    console.warn('[VendorPayment] Expense record skipped:', expErr.message);
                }
            }
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
