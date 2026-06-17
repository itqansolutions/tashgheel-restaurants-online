const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const storage = require('../utils/storage');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// === Data Storage Endpoints ===

// Save Data
router.post('/data/save', async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Key is required' });
    try {
        const tid = req.tenantId || 'global';
        // Use storage.saveData so values are always serialized as strings,
        // consistent with how public-api.js reads them via storage.readData
        await storage.saveData(key, value, tid);
        res.json({ success: true });
    } catch (err) {
        console.error(`Error saving ${key}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// List Data Keys
router.get('/data/list', async (req, res) => {
    try {
        const tid = req.tenantId || 'global';
        const docs = await prisma.data.findMany({
            where: { tenantId: tid },
            select: { key: true }
        });
        res.json(docs.map(d => d.key));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Read Data
router.get('/data/read/:key', async (req, res) => {
    const { key } = req.params;
    try {
        const tid = req.tenantId || 'global';
        const dataDoc = await prisma.data.findUnique({
            where: { key_tenantId: { key, tenantId: tid } }
        });

        let rawData = dataDoc ? dataDoc.value : null;

        // Branch Enforcement for Sales/Receipts
        if (req.branchId && (key === 'sales' || key.startsWith('receipts'))) {
            if (!rawData) return res.json([]);

            let data = Array.isArray(rawData) ? rawData : [];
            if (typeof rawData === 'string') {
                try { data = JSON.parse(rawData); } catch (e) { data = []; }
            }

            if (Array.isArray(data)) {
                const filtered = data.filter(item => item.branchId === req.branchId);
                return res.json(filtered);
            }
        }

        // Branch Stock Merging for Products
        if (req.branchId && (key === 'spare_parts' || key === 'products')) {
            let products = [];
            if (rawData) {
                products = Array.isArray(rawData) ? rawData : [];
                if (typeof rawData === 'string') {
                    try { products = JSON.parse(rawData); } catch (e) { products = []; }
                }
            }

            try {
                const stocks = await prisma.productStock.findMany({
                    where: {
                        tenantId: req.tenantId,
                        branchId: req.branchId
                    }
                });

                const stockMap = {};
                stocks.forEach(s => stockMap[s.productId] = s.qty);

                products.forEach(p => {
                    p.stock = stockMap[p.id] || 0;
                });
                return res.json(products);

            } catch (e) {
                console.error('Stock Merge Error', e);
                return res.json(products);
            }
        }

        if (typeof rawData === 'object' && rawData !== null) {
            return res.json(rawData);
        }
        res.send(rawData || '');
    } catch (err) {
        console.error(`Error reading ${key}:`, err);
        res.status(500).send('');
    }
});

// List Data Files
router.get('/data/list', async (req, res) => {
    try {
        const tid = req.tenantId || 'global';
        const dataItems = await prisma.data.findMany({
            where: { tenantId: tid },
            select: { key: true, updatedAt: true }
        });
        res.json(dataItems.map(d => ({ key: d.key, updatedAt: d.updatedAt })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a Data Key
router.delete('/data/delete/:key', async (req, res) => {
    const { key } = req.params;
    if (!key) return res.status(400).json({ success: false, error: 'Key is required' });

    try {
        const tid = req.tenantId || 'global';
        await prisma.data.deleteMany({
            where: { key, tenantId: tid }
        });
        res.json({ success: true, message: `Data '${key}' cleared` });
    } catch (err) {
        console.error(`Error deleting ${key}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// === SHIFT MANAGEMENT ===

// 1. Get Current Shift (Multi-User)
router.get('/shifts/current', async (req, res) => {
    try {
        const shift = await prisma.shift.findFirst({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                status: 'open',
                OR: [
                    { cashierId: req.userId },
                    { cashiers: { path: [], array_contains: req.userId } }
                ]
            }
        });
        if (shift) {
            // Real-time calculations of totals for active shift display (prior to closing)
            const salesByMethod = await prisma.sale.groupBy({
                by: ['method'],
                where: { shiftId: shift.id, status: 'finished' },
                _sum: { total: true, splitCash: true, splitCard: true }
            });
            const stats = { cashTotal: 0, cardTotal: 0, mobileTotal: 0, splitCashTotal: 0, splitCardTotal: 0, talabatCashTotal: 0, talabatVisaTotal: 0, totalSales: 0 };
            salesByMethod.forEach(m => {
                if (m.method === 'cash') stats.cashTotal += m._sum.total || 0;
                if (m.method === 'card') stats.cardTotal += m._sum.total || 0;
                if (m.method === 'mobile') stats.mobileTotal += m._sum.total || 0;
                if (m.method === 'talabat_cash') stats.talabatCashTotal += m._sum.total || 0;
                if (m.method === 'talabat_visa') stats.talabatVisaTotal += m._sum.total || 0;
                if (m.method === 'split') {
                    stats.splitCashTotal += m._sum.splitCash || 0;
                    stats.splitCardTotal += m._sum.splitCard || 0;
                }
            });

            // Calculate cash expenses registered during the shift
            const expensesAggregate = await prisma.expense.aggregate({
                where: { shiftId: shift.id, method: 'cash' },
                _sum: { amount: true }
            });
            const cashExpenses = expensesAggregate._sum.amount || 0;
            stats.cashExpenses = cashExpenses;

            // Combine split portions
            stats.cashTotal += stats.splitCashTotal;
            stats.cardTotal += stats.splitCardTotal;
            stats.totalSales = stats.cashTotal + stats.cardTotal + stats.mobileTotal + stats.talabatCashTotal + stats.talabatVisaTotal;

            const voidsCount = await prisma.sale.count({
                where: { shiftId: shift.id, status: 'void' }
            });
            const voidsSum = await prisma.sale.aggregate({
                where: { shiftId: shift.id, status: 'void' },
                _sum: { total: true }
            });

            shift.totals = {
                ...stats,
                voidsCount,
                voidsValue: voidsSum._sum.total || 0
            };
        }
        res.json({ shift });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1.1 List Active Shifts for Branch
router.get('/shifts/active-branch', async (req, res) => {
    try {
        const shifts = await prisma.shift.findMany({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                status: 'open'
            },
            include: {
                cashier: { select: { username: true, fullName: true } }
            }
        });
        res.json(shifts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1.2 Get Shift History
router.get('/shifts/history', async (req, res) => {
    try {
        const shifts = await prisma.shift.findMany({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId
            },
            include: {
                cashier: { select: { username: true, fullName: true } }
            },
            orderBy: { openedAt: 'desc' }
        });
        res.json(shifts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Open Shift
router.post('/shifts/open', async (req, res) => {
    try {
        const { openingCash } = req.body;

        const existing = await prisma.shift.findFirst({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                cashierId: req.userId,
                status: 'open'
            }
        });

        if (existing) return res.status(400).json({ error: 'You already have an open shift' });

        const newShift = await prisma.shift.create({
            data: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                cashierId: req.userId,
                cashiers: [req.userId],
                openingCash: parseFloat(openingCash || 0)
            }
        });

        res.json({ success: true, shift: newShift });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.1 Join Existing Shift
router.post('/shifts/join', async (req, res) => {
    try {
        const { shiftId } = req.body;

        const shift = await prisma.shift.findUnique({
            where: { id: shiftId }
        });

        if (!shift || shift.status !== 'open' || shift.tenantId !== req.tenantId) {
            return res.status(404).json({ error: 'Shift not found or closed' });
        }

        let cashiers = Array.isArray(shift.cashiers) ? shift.cashiers : [];
        if (!cashiers.includes(req.userId)) {
            cashiers.push(req.userId);
            await prisma.shift.update({
                where: { id: shiftId },
                data: { cashiers }
            });
        }

        res.json({ success: true, shift });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Close Shift
router.post('/shifts/close', async (req, res) => {
    try {
        const { closingCash, shiftId, notes } = req.body;

        const shift = await prisma.shift.findUnique({
            where: { id: shiftId }
        });
        if (!shift || shift.status !== 'open') return res.status(404).json({ error: 'Shift not found or already closed' });

        // Manual grouping for different methods
        const salesByMethod = await prisma.sale.groupBy({
            by: ['method'],
            where: { shiftId: shift.id, status: 'finished' },
            _sum: { total: true, splitCash: true, splitCard: true }
        });

        const stats = { cashTotal: 0, cardTotal: 0, mobileTotal: 0, splitCashTotal: 0, splitCardTotal: 0, talabatCashTotal: 0, talabatVisaTotal: 0, totalSales: 0 };
        salesByMethod.forEach(m => {
            if (m.method === 'cash') stats.cashTotal += m._sum.total || 0;
            if (m.method === 'card') stats.cardTotal += m._sum.total || 0;
            if (m.method === 'mobile') stats.mobileTotal += m._sum.total || 0;
            if (m.method === 'talabat_cash') stats.talabatCashTotal += m._sum.total || 0;
            if (m.method === 'talabat_visa') stats.talabatVisaTotal += m._sum.total || 0;
            if (m.method === 'split') {
                stats.splitCashTotal += m._sum.splitCash || 0;
                stats.splitCardTotal += m._sum.splitCard || 0;
            }
        });

        // Calculate cash expenses registered during the shift
        const expensesAggregate = await prisma.expense.aggregate({
            where: { shiftId: shift.id, method: 'cash' },
            _sum: { amount: true }
        });
        const cashExpenses = expensesAggregate._sum.amount || 0;
        stats.cashExpenses = cashExpenses;

        // Combine split portions
        stats.cashTotal += stats.splitCashTotal;
        stats.cardTotal += stats.splitCardTotal;
        stats.totalSales = stats.cashTotal + stats.cardTotal + stats.mobileTotal + stats.talabatCashTotal + stats.talabatVisaTotal;

        const voidsCount = await prisma.sale.count({
            where: { shiftId: shift.id, status: 'void' }
        });
        const voidsSum = await prisma.sale.aggregate({
            where: { shiftId: shift.id, status: 'void' },
            _sum: { total: true }
        });

        const expectedCash = shift.openingCash + stats.cashTotal - cashExpenses;

        const updateData = {
            closedAt: new Date(),
            status: 'closed',
            closingCash: parseFloat(closingCash || 0),
            expectedCash: expectedCash,
            difference: parseFloat(closingCash || 0) - expectedCash,
            notes: notes || "",
            totals: {
                ...stats,
                voidsCount,
                voidsValue: voidsSum._sum.total || 0
            }
        };

        if (req.userId !== shift.cashierId) {
            updateData.forcedById = req.userId;
            updateData.status = 'force-closed';
        }

        const closedShift = await prisma.shift.update({
            where: { id: shiftId },
            data: updateData
        });

        res.json({ success: true, shift: closedShift });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function deductIngredientsStock(tenantId, items, txClient = prisma) {
    try {
        let products = [];
        const prodData = await txClient.data.findFirst({
            where: {
                tenantId,
                key: { in: ['products', 'spare_parts'] }
            }
        });
        if (prodData) {
            products = typeof prodData.value === 'string' ? JSON.parse(prodData.value) : prodData.value;
        }
        if (!Array.isArray(products)) products = [];

        const ingData = await txClient.data.findUnique({
            where: { key_tenantId: { key: 'ingredients', tenantId } }
        });
        if (!ingData) return;

        let ingredients = typeof ingData.value === 'string' ? JSON.parse(ingData.value) : ingData.value;
        if (!Array.isArray(ingredients)) return;

        let changed = false;

        for (const item of items) {
            const product = products.find(p => String(p.id) === String(item.productId || item.id) || p.code === (item.productCode || item.code));
            if (!product) continue;

            let recipeToUse = [];
            if ((item.sizeId || item.sizeName) && product.hasSizes && product.sizes) {
                const size = product.sizes.find(s => s.id == item.sizeId || s.name === item.sizeName);
                recipeToUse = size ? (size.recipe || []) : [];
            } else {
                recipeToUse = product.recipe || [];
            }

            if (recipeToUse && recipeToUse.length > 0) {
                recipeToUse.forEach(ingItem => {
                    const idx = ingredients.findIndex(i => String(i.id) === String(ingItem.ingredientId));
                    if (idx !== -1) {
                        const factor = parseFloat(ingItem.conversionFactor || 1);
                        let consumeQty = 0;
                        const qtyToDeduct = parseFloat(item.qty || 0);

                        if (ingItem.wasteType === 'fixed') {
                            consumeQty = (parseFloat(ingItem.qty || 0) + parseFloat(ingItem.wasteValue || 0)) * qtyToDeduct * factor;
                        } else {
                            const w = parseFloat(ingItem.wasteValue || ingItem.wastePercent || 0);
                            if (w < 100) {
                                const yieldPct = (100 - w) / 100;
                                const grossUsageQty = parseFloat(ingItem.qty || 0) / yieldPct;
                                consumeQty = grossUsageQty * qtyToDeduct * factor;
                            } else {
                                consumeQty = parseFloat(ingItem.qty || 0) * qtyToDeduct * factor;
                            }
                        }

                        const oldStock = parseFloat(ingredients[idx].stock || 0);
                        ingredients[idx].stock = oldStock - consumeQty;
                        ingredients[idx].lastUsedAt = new Date().toISOString();
                        changed = true;
                    }
                });
            }
        }

        if (changed) {
            await txClient.data.update({
                where: { key_tenantId: { key: 'ingredients', tenantId } },
                data: { value: JSON.stringify(ingredients), updatedAt: new Date() }
            });
        }
    } catch (err) {
        console.error('[INGREDIENTS_DEDUCTION] Error processing stock deduction:', err);
    }
}

// === SALES ===

router.post('/sales', async (req, res) => {
    try {
        const saleData = req.body;
        if (!saleData || !saleData.items) return res.status(400).json({ error: 'Invalid Sale Data' });

        const activeShift = await prisma.shift.findFirst({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                status: 'open',
                OR: [
                    { cashierId: req.userId },
                    { cashiers: { path: [], array_contains: req.userId } }
                ]
            }
        });
        if (!activeShift) return res.status(403).json({ error: 'No open shift found. Please open or join a shift first.' });

        // Cost Snapshot
        try {
            const masterData = await prisma.data.findUnique({
                where: { key_tenantId: { key: 'spare_parts', tenantId: req.tenantId } }
            });
            const masterProducts = masterData ? (Array.isArray(masterData.value) ? masterData.value : []) : [];
            const costMap = {};
            masterProducts.forEach(p => costMap[String(p.id)] = p.cost || 0);

            saleData.items.forEach(item => {
                item.cost = costMap[String(item.id)] || 0;
            });
        } catch (e) { console.error('Cost Snapshot Error:', e); }

        // Atomic Transaction for Sale creation and Stock deduction
        const result = await prisma.$transaction(async (tx) => {
            const sale = await tx.sale.create({
                data: {
                    id: saleData.id,
                    receiptNo: saleData.receiptNo,
                    note: saleData.note,
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    cashier: saleData.cashier,
                    salesman: saleData.salesman,
                    shiftId: activeShift.id,
                    total: saleData.total,
                    subtotal: saleData.subtotal,
                    discount: saleData.discount || 0,
                    deliveryFee: saleData.deliveryFee || 0,
                    tax: saleData.tax || 0,
                    method: saleData.method || 'cash',
                    splitCash: parseFloat(saleData.splitCash || 0),
                    splitCard: parseFloat(saleData.splitCard || 0),
                    orderType: saleData.orderType || 'take_away',
                    tableId: saleData.tableId,
                    tableName: saleData.tableName,
                    customer: saleData.customer || {},
                    source: saleData.source || 'pos',
                    aggregatorOrderId: saleData.aggregatorOrderId,
                    date: new Date(),
                    items: {
                        create: saleData.items.map(item => ({
                            productId: String(item.id),
                            productCode: item.code,
                            name: item.name,
                            qty: item.qty,
                            price: item.price,
                            cost: item.cost || 0,
                            note: item.note || '',
                            discountType: item.discount?.type || 'none',
                            discountValue: item.discount?.value || 0
                        }))
                    }
                }
            });

            // Deduct Stock
            for (const item of saleData.items) {
                await tx.productStock.upsert({
                    where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: req.branchId, productId: String(item.id) } },
                    update: { qty: { decrement: item.qty } },
                    create: { tenantId: req.tenantId, branchId: req.branchId, productId: String(item.id), qty: -item.qty }
                });

                if (item.addons) {
                    for (const addon of item.addons) {
                        await tx.productStock.upsert({
                            where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: req.branchId, productId: String(addon.id) } },
                            update: { qty: { decrement: item.qty } },
                            create: { tenantId: req.tenantId, branchId: req.branchId, productId: String(addon.id), qty: -item.qty }
                        });
                    }
                }
            }

            // Deduct Ingredients Stock (raw materials)
            await deductIngredientsStock(req.tenantId, saleData.items, tx);

            return sale;
        });

        // Async Updates (Audit and Summary)
        updateDailySummary(req, result).catch(e => console.error('Summary Update Error:', e));

        await prisma.auditLog.create({
            data: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                userId: req.userId,
                action: 'SALE_CREATE',
                details: { saleId: result.id, total: result.total },
                ipAddress: req.ip
            }
        });

        res.json({ success: true, id: result.id });
    } catch (err) {
        console.error('Sale Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Refund Endpoint
router.post('/sales/refund/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const sale = await prisma.sale.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!sale || sale.tenantId !== req.tenantId) return res.status(404).json({ error: 'Sale not found' });

        // STRICTOR Isolation: Ensure branchId matches to prevent cross-branch refunding by non-admins
        if (sale.branchId !== req.branchId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'FORBIDDEN', msg: 'You do not have permission to refund sales from this branch' });
        }

        if (sale.status === 'refunded' || sale.status === 'void') {
            return res.status(400).json({ error: 'Sale is already refunded/voided' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.sale.update({
                where: { id },
                data: {
                    status: 'refunded',
                    note: (sale.note || '') + ` | Refund Reason: ${reason || 'Customer Return'}`
                }
            });

            // Restore Stock
            for (const item of sale.items) {
                await tx.productStock.upsert({
                    where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: req.branchId, productId: item.productId } },
                    update: { qty: { increment: item.qty } },
                    create: { tenantId: req.tenantId, branchId: req.branchId, productId: item.productId, qty: item.qty }
                });
            }
        });

        await prisma.auditLog.create({
            data: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                userId: req.userId,
                action: 'SALE_REFUND',
                details: { saleId: id, reason, total: sale.total },
                ipAddress: req.ip
            }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Refund Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update Sale (Used for finalizing online orders or updating notes/payment)
router.patch('/sales/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const sale = await prisma.sale.findUnique({
            where: { id }
        });

        if (!sale || sale.tenantId !== req.tenantId) return res.status(404).json({ error: 'Sale not found' });

        // Merge existing items if necessary or replace?
        // For online order finalization, we usually just update status, method, shiftId, etc.
        const updated = await prisma.sale.update({
            where: { id },
            data: {
                ...updateData,
                date: updateData.date ? new Date(updateData.date) : undefined
            }
        });

        res.json({ success: true, sale: updated });
    } catch (err) {
        console.error('Sale Update Error:', err);
        res.status(500).json({ error: err.message });
    }
});

async function updateDailySummary(req, result) {
    try {
        const branch = await prisma.branch.findUnique({ where: { id: req.branchId } });
        const timezone = branch?.settings?.timezone || 'Africa/Cairo';
        const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });

        const isVoid = result.status === 'void';
        const isRefund = result.status === 'refunded';

        const costTotal = Array.isArray(result.items) ? result.items.reduce((sum, i) => sum + ((i.cost || 0) * (i.qty || 0)), 0) : 0;

        await prisma.dailySummary.upsert({
            where: { tenantId_branchId_date: { tenantId: req.tenantId, branchId: req.branchId, date: dateStr } },
            update: {
                totalRevenue: { increment: (isVoid || isRefund) ? 0 : result.total },
                totalOrders: { increment: (isVoid || isRefund) ? 0 : 1 },
                totalDiscount: { increment: (isVoid || isRefund) ? 0 : (result.discount || 0) },
                totalTax: { increment: (isVoid || isRefund) ? 0 : (result.tax || 0) },
                totalCost: { increment: (isVoid || isRefund) ? 0 : costTotal },
                voidsCount: { increment: isVoid ? 1 : 0 },
                voidsValue: { increment: isVoid ? result.total : 0 },
                cashTotal: { increment: (!isVoid && !isRefund && result.method === 'cash') ? result.total : 0 },
                cardTotal: { increment: (!isVoid && !isRefund && result.method === 'card') ? result.total : 0 },
                mobileTotal: { increment: (!isVoid && !isRefund && result.method === 'mobile') ? result.total : 0 },
            },
            create: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                date: dateStr,
                totalRevenue: (isVoid || isRefund) ? 0 : result.total,
                totalOrders: (isVoid || isRefund) ? 0 : 1,
                totalDiscount: (isVoid || isRefund) ? 0 : (result.discount || 0) ,
                totalTax: (isVoid || isRefund) ? 0 : (result.tax || 0),
                totalCost: (isVoid || isRefund) ? 0 : costTotal,
                voidsCount: isVoid ? 1 : 0,
                voidsValue: isVoid ? result.total : 0,
                mobileTotal: (!isVoid && !isRefund && result.method === 'mobile') ? result.total : 0
            }
        });
    } catch (e) { console.error('Summary Update Error:', e); }
}

// === KITCHEN DISPLAY SYSTEM ===

// 1. Get Pending Kitchen Orders
router.get('/kitchen/orders', async (req, res) => {
    try {
        const orders = await prisma.sale.findMany({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                kitchenStatus: { in: ['pending', 'preparing'] },
                status: { notIn: ['void', 'refunded'] }
            },
            include: { items: true },
            orderBy: { date: 'asc' }
        });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1.1 Get Pending Online Orders (For POS)
router.get('/kitchen/online-pending', async (req, res) => {
    try {
        const orders = await prisma.sale.findMany({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                source: 'online_store',
                status: 'pending'
            },
            include: { items: true },
            orderBy: { date: 'desc' }
        });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Mark Order as Complete (Ready/Out for Delivery)
router.post('/kitchen/complete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sale = await prisma.sale.findUnique({
            where: { id }
        });

        if (!sale || sale.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });

        const newKitchenStatus = sale.source === 'online_store' ? 'out_for_delivery' : 'ready';

        await prisma.sale.update({
            where: { id },
            data: {
                kitchenStatus: newKitchenStatus
            }
        });

        res.json({ success: true, status: newKitchenStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Mark Order as Preparing
router.post('/kitchen/preparing/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sale = await prisma.sale.findUnique({
            where: { id }
        });

        if (!sale || sale.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });

        await prisma.sale.update({
            where: { id },
            data: {
                kitchenStatus: 'preparing'
            }
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === INVENTORY MANAGEMENT ===

// 1. Set Stock (Absolute)
router.post('/inventory/set', async (req, res) => {
    try {
        const { productId, qty } = req.body;
        if (!productId || qty === undefined) return res.status(400).json({ error: 'Missing Data' });

        await prisma.productStock.upsert({
            where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: req.branchId, productId: String(productId) } },
            update: { qty: parseFloat(qty) },
            create: { tenantId: req.tenantId, branchId: req.branchId, productId: String(productId), qty: parseFloat(qty) }
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Inventory Set Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Adjust Inventory (Waste, Damage, Audit, Transfer)
router.post('/inventory/adjust', async (req, res) => {
    try {
        const { itemId, type, qty, unitCost, reason } = req.body;

        if (!itemId || !type || qty === undefined || unitCost === undefined) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const adjustmentQty = parseFloat(qty);
        const adjustmentUnitCost = parseFloat(unitCost);
        const totalCost = adjustmentQty * adjustmentUnitCost;

        await prisma.$transaction(async (tx) => {
            await tx.inventoryAdjustment.create({
                data: {
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    itemId: String(itemId),
                    type,
                    qty: adjustmentQty,
                    unitCost: adjustmentUnitCost,
                    totalCost,
                    reason,
                    createdBy: req.userId
                }
            });

            await tx.productStock.upsert({
                where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: req.branchId, productId: String(itemId) } },
                update: { qty: { increment: adjustmentQty } },
                create: { tenantId: req.tenantId, branchId: req.branchId, productId: String(itemId), qty: adjustmentQty }
            });

            await tx.auditLog.create({
                data: {
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    userId: req.userId,
                    action: 'INVENTORY_ADJUST',
                    details: { itemId, type, qty: adjustmentQty, reason },
                    ipAddress: req.ip
                }
            });
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Inventory Adjustment Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Transfer Inventory
router.post('/inventory/transfer', async (req, res) => {
    try {
        const { itemId, targetBranchId, qty, unitCost = 0 } = req.body;

        if (!itemId || !targetBranchId || !qty || qty <= 0) {
            return res.status(400).json({ error: "Invalid transfer parameters" });
        }

        if (String(req.branchId) === String(targetBranchId)) {
            return res.status(400).json({ error: "Cannot transfer to same branch" });
        }

        const transferQty = parseFloat(qty);
        const transferUnitCost = parseFloat(unitCost);
        const totalCost = transferQty * transferUnitCost;
        const referenceId = `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        await prisma.$transaction(async (tx) => {
            // Check Source Stock
            const sourceStock = await tx.productStock.findUnique({
                where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: req.branchId, productId: String(itemId) } }
            });
            if (!sourceStock || sourceStock.qty < transferQty) {
                throw new Error("Insufficient stock for transfer");
            }

            // Adjust Source
            await tx.inventoryAdjustment.create({
                data: {
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    itemId: String(itemId),
                    type: 'TRANSFER_OUT',
                    qty: -transferQty,
                    unitCost: transferUnitCost,
                    totalCost,
                    reason: `Transfer to Branch ${targetBranchId}`,
                    referenceId,
                    createdBy: req.userId
                }
            });
            await tx.productStock.update({
                where: { id: sourceStock.id },
                data: { qty: { decrement: transferQty } }
            });

            // Adjust Target
            await tx.inventoryAdjustment.create({
                data: {
                    tenantId: req.tenantId,
                    branchId: targetBranchId,
                    itemId: String(itemId),
                    type: 'TRANSFER_IN',
                    qty: transferQty,
                    unitCost: transferUnitCost,
                    totalCost,
                    reason: `Transfer from Branch ${req.branchId}`,
                    referenceId,
                    createdBy: req.userId
                }
            });
            await tx.productStock.upsert({
                where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: targetBranchId, productId: String(itemId) } },
                update: { qty: { increment: transferQty } },
                create: { tenantId: req.tenantId, branchId: targetBranchId, productId: String(itemId), qty: transferQty }
            });
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Transfer Error:', err);
        res.status(400).json({ error: err.message });
    }
});

// === Reporting Endpoints ===

// 1. Live Sales Monitor
router.get('/reports/live', async (req, res) => {
    try {
        const { tenantId } = req;
        const branchId = req.query.branchId || req.branchId;

        // Use Branch Timezone for "Today" boundaries
        const branch = await prisma.branch.findFirst({ 
            where: { id: branchId, tenantId: req.tenantId } 
        });
        
        if (!branch) {
            return res.status(403).json({ error: 'FORBIDDEN', msg: 'Branch access denied or invalid branch' });
        }
        
        const timezone = branch.settings?.timezone || 'Africa/Cairo';
        
        // Get start of today in branch timezone, converted to UTC
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
        const today = new Date(todayStr + 'T00:00:00Z'); // Note: This is an approximation, but better than UTC 00:00

        const filter = { tenantId, date: { gte: today }, status: 'finished' };
        if (branchId && branchId !== 'all') filter.branchId = branchId;

        const stats = await prisma.sale.aggregate({
            where: filter,
            _sum: { total: true },
            _count: { id: true },
            _avg: { total: true }
        });

        const recentOrders = await prisma.sale.findMany({
            where: filter,
            orderBy: { date: 'desc' },
            take: 10
        });

        const shiftFilter = { tenantId, cashierId: req.userId, status: 'open' };
        if (branchId && branchId !== 'all') shiftFilter.branchId = branchId;

        const currentShift = await prisma.shift.findFirst({
            where: shiftFilter
        });

        res.json({
            stats: {
                totalRevenue: stats._sum.total || 0,
                orderCount: stats._count.id || 0,
                avgTicket: stats._avg.total || 0
            },
            recentOrders,
            currentShift
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Sales History (Paginated)
router.get('/reports/history', async (req, res) => {
    try {
        const { tenantId } = req;
        const queryBranchId = req.query.branchId;
        
        let { page = 1, limit = 50, from, to, cashier, status } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);

        const filter = { tenantId };
        
        if (queryBranchId && queryBranchId !== 'all') {
            filter.branchId = queryBranchId;
        } else if (req.branchId && queryBranchId !== 'all') {
            filter.branchId = req.branchId;
        }

        if (from || to) {
            filter.date = {};
            if (from) filter.date.gte = new Date(isNaN(Number(from)) ? from : Number(from));
            if (to) filter.date.lte = new Date(isNaN(Number(to)) ? to : Number(to));
        }
        if (cashier) filter.cashierId = cashier;
        if (status) filter.status = status;

        const total = await prisma.sale.count({ where: filter });

        const summaryData = await prisma.sale.groupBy({
            by: ['method'],
            where: filter,
            _sum: { total: true, discount: true }
        });

        const summary = { totalCash: 0, totalCard: 0, totalMobile: 0, totalDiscount: 0 };
        summaryData.forEach(s => {
            if (s.method === 'cash') summary.totalCash = s._sum.total || 0;
            if (s.method === 'card') summary.totalCard = s._sum.total || 0;
            if (s.method === 'mobile') summary.totalMobile = s._sum.total || 0;
            summary.totalDiscount += (s._sum.discount || 0);
        });

        const sales = await prisma.sale.findMany({
            where: filter,
            orderBy: { date: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: { items: true }
        });

        res.json({
            total,
            page,
            pages: Math.ceil(total / limit),
            summary,
            sales
        });
    } catch (err) {
        console.error('History Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Get Single Sale
router.get('/sales/:id', async (req, res) => {
    try {
        const sale = await prisma.sale.findUnique({
            where: { id: req.params.id },
            include: { items: true }
        });
        if (!sale || sale.tenantId !== req.tenantId) return res.status(404).json({ error: 'Receipt not found' });
        res.json(sale);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === Utilities ===
router.post('/utils/ensure-data-dir', async (req, res) => {
    res.json(true); 
});

router.post('/file/exists', async (req, res) => {
    const { filename } = req.body;
    // Check if filename exists in our Data model as a key
    const exists = await prisma.data.findUnique({
        where: { key_tenantId: { key: filename, tenantId: req.tenantId || 'global' } }
    });
    res.json(!!exists);
});

module.exports = router;
