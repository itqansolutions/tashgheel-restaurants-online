const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const storage = require('../utils/storage');
const { readCatalog, snapshotItems } = require('../utils/catalog');
const crypto = require('crypto');
const { returnOptions, planReturn } = require('../utils/returns');
const {applyStock}=require('../utils/stock');
const fs = require('fs').promises;
const path = require('path');

// === Data Storage Endpoints ===

// Save Data
router.post('/data/save', async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Key is required' });
    if (String(key).startsWith('kitchen_draft_v1:')) return res.status(403).json({error:'Use kitchen draft lifecycle endpoints'});
    try {
        const tid = req.tenantId || 'global';
        let savedValue;
        // Use storage.saveData so values are always serialized as strings,
        // consistent with how public-api.js reads them via storage.readData
        if (['spare_parts', 'products', 'ingredients'].includes(key)) {
            await prisma.$transaction(async tx => {
                await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tid} FOR UPDATE`;
                const current = await tx.data.findUnique({ where: { key_tenantId: { key, tenantId: tid } } });
                const old = current ? (typeof current.value === 'string' ? JSON.parse(current.value) : current.value) : [];
                const incoming = typeof value === 'string' ? JSON.parse(value) : value;
                if (!Array.isArray(incoming)) { const error = new Error('Invalid catalog or ingredients'); error.status = 400; throw error; }
                for (const item of old) {
                    const next = incoming.find(i => String(i.id) === String(item.id));
                    if (!next || (item.stockRevision || item.updatedAt || null) !== (next.stockRevision || next.updatedAt || null)) {
                        const error = new Error('Data changed. Reload before saving.'); error.status = 409; throw error;
                    }
                }
                savedValue = incoming.map(item => ({...item, stockRevision: crypto.randomUUID()}));
                const content = JSON.stringify(savedValue);
                await tx.data.upsert({where:{key_tenantId:{key,tenantId:tid}},update:{value:content},create:{key,tenantId:tid,value:content}});
            });
        } else await storage.saveData(key, value, tid);

        res.json({ success: true, value: savedValue });
    } catch (err) {
        console.error(`Error saving ${key}:`, err);
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});


// Menu form saves only its item and the selected branch stock atomically.
router.post('/products/save', async (req, res) => {
    try {
        const product = req.body.product;
        if (!product || product.id == null || !product.name) return res.status(400).json({ error: 'Invalid product' });
        const stock = Number(product.stock);
        if (!Number.isFinite(stock)) return res.status(400).json({ error: 'Invalid stock' });
        const savedProduct = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            const products = await readCatalog(tx, req.tenantId);
            const index = products.findIndex(p => String(p.id) === String(product.id));
            const existing = index >= 0 ? products[index] : {};
            let next = { ...existing, ...product, stockRevision: crypto.randomUUID(), createdAt: existing.createdAt || product.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
            if(require('../utils/recipes').requiredRecipe(next)) {
                const ingredientDoc=await tx.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:req.tenantId}}});
                const ingredients=require('../utils/catalog').parseArray(ingredientDoc?.value);
                next=require('../utils/recipe-cost').calculateRecipeCost(next,ingredients);
            }
            if (index >= 0 && (existing.stockRevision || null) !== (req.body.expectedStockRevision || null)) { const error = new Error('Menu changed. Reload before saving.'); error.status = 409; throw error; }
            if (index >= 0 && req.body.expectedUpdatedAt !== undefined && (existing.updatedAt || null) !== req.body.expectedUpdatedAt) { const error = new Error('Menu item changed. Reload before saving.'); error.status = 409; throw error; }
            if (index >= 0) products[index] = next; else products.push(next);
            const value = JSON.stringify(products);
            await tx.data.upsert({ where: { key_tenantId: { key: 'spare_parts', tenantId: req.tenantId } }, update: { value }, create: { key: 'spare_parts', tenantId: req.tenantId, value } });
            if ((product.itemType || product.type) === 'simple' && (index < 0 || req.body.stockChanged !== false)) {
                const balance = await tx.productStock.findUnique({ where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: req.branchId, productId: String(product.id) } } });
                if (index >= 0 && (!Number.isFinite(Number(req.body.expectedStock)) || Number(balance?.qty || 0) !== Number(req.body.expectedStock))) { const error = new Error('Stock changed. Reload before setting a new balance.'); error.status = 409; throw error; }
                if (balance) {
                    const changed=await tx.productStock.updateMany({where:{id:balance.id,qty:balance.qty},data:{qty:stock}});
                    if(changed.count!==1) {const error=new Error('Stock changed. Reload before saving.');error.status=409;throw error;}
                } else await tx.productStock.create({data:{tenantId:req.tenantId,branchId:req.branchId,productId:String(product.id),qty:stock}});
            }
            return next;
        });
        res.json({ success: true, product: savedProduct });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// Compatible explicit version-checked removal, rather than unversioned bulk deletion.
router.post('/data/remove-item', async (req, res) => {
    try {
        const { key, id, revision } = req.body;
        if (!['ingredients','spare_parts','products'].includes(key)) return res.status(400).json({error:'Invalid collection'});
        const value = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            let doc = await tx.data.findUnique({where:{key_tenantId:{key,tenantId:req.tenantId}}});
            let current = doc ? (typeof doc.value === 'string' ? JSON.parse(doc.value) : doc.value) : [];
            if(key==='spare_parts' && !current.length) {current=await readCatalog(tx,req.tenantId);}
            const item = current.find(i=>String(i.id)===String(id));
            if (!item) return current;
            if ((item.stockRevision || item.updatedAt || null) !== (revision || null)) { const error=new Error('Item changed. Reload before removing.');error.status=409;throw error; }
            const value=current.filter(i=>String(i.id)!==String(id));
            await tx.data.upsert({where:{key_tenantId:{key,tenantId:req.tenantId}},update:{value:JSON.stringify(value)},create:{key,tenantId:req.tenantId,value:JSON.stringify(value)}});
            return value;
        });
        res.json({success:true,value});
    } catch(err) {res.status(err.status||500).json({error:err.message});}
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
    if(String(key).startsWith('kitchen_draft_v1:'))return res.status(403).json({error:'Use scoped kitchen draft endpoints'});
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
                const ingredientsDoc=await prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:req.tenantId}}});
                const ingredients=ingredientsDoc?(typeof ingredientsDoc.value==='string'?JSON.parse(ingredientsDoc.value):ingredientsDoc.value):[];
                return res.json(require('../utils/recipe-availability').withRecipeAvailability(products,Array.isArray(ingredients)?ingredients:[]));

            } catch (e) {
                console.error('Stock Merge Error', e);
                return res.status(503).json({error:'Catalog availability could not be verified'});
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
    if (String(key).startsWith('kitchen_draft_v1:')) return res.status(403).json({error:'Use kitchen draft lifecycle endpoints'});

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


function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => !['createdAt', 'date'].includes(k)).map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    return JSON.stringify(value);
}

// === SALES ===

router.post('/sales', async (req, res) => {
    try {
        const saleData = req.body;
        if (!saleData || !saleData.items) return res.status(400).json({ error: 'Invalid Sale Data' });
        const requestHash = crypto.createHash('sha256').update(stableStringify(saleData)).digest('hex');
        let activeShift = await prisma.shift.findFirst({
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

        // Fallback: If no shift specifically assigned to this user, check for any open shift in this branch
        if (!activeShift) {
            activeShift = await prisma.shift.findFirst({
                where: {
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    status: 'open'
                }
            });
        }

        if (!activeShift) return res.status(403).json({ error: 'No open shift found. Please open or join a shift first.' });

        // Server owns stock and cost snapshots. No client-side financial writes.
        const result = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            if (saleData.id) {
                const existing = await tx.sale.findUnique({ where: { id: saleData.id } });
                if (existing) {
                    const audit = await tx.auditLog.findFirst({ where: { tenantId: req.tenantId, action: 'SALE_CREATE', details: { path: ['saleId'], equals: existing.id } }, orderBy: { timestamp: 'desc' } });
                    if (existing.tenantId !== req.tenantId || existing.branchId !== req.branchId || audit?.details?.requestHash !== requestHash) {
                        const error = new Error('Sale id already used for a different or unverifiable request'); error.status = 409; throw error;
                    }
                    return { ...existing, replayed: true };
                }
            }
            saleData.items = snapshotItems(saleData.items, await readCatalog(tx, req.tenantId));
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
                },
                include: { items: true }
            });

            const movements = await applyStock(tx, req.tenantId, req.branchId, saleData.items);

        await tx.auditLog.create({
            data: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                userId: req.userId,
                action: 'SALE_CREATE',
                details: { saleId: sale.id, total: sale.total, requestHash, movements },
                ipAddress: req.ip
            }
        });

            return sale;
        });

        // Async Updates (Audit and Summary)
        if (!result.replayed) updateDailySummary(req, result).catch(e => console.error('Summary Update Error:', e));

        res.json({ success: true, id: result.id, replayed: !!result.replayed });
    } catch (err) {
        console.error('Sale Error:', err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// Read-only choices from the sale's original movement proof, never today's menu.
router.get('/sales/:id/return-options', async (req, res) => {
    try {
        const sale = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId: req.tenantId, branchId: req.branchId }, include: { items: true } });
        if (!sale) return res.status(404).json({ error: 'Sale not found' });
        if (sale.status !== 'finished') return res.status(409).json({ error: 'Only completed receipts can be returned' });
        const original = await prisma.auditLog.findFirst({ where: { tenantId: req.tenantId, action: 'SALE_CREATE', details: { path: ['saleId'], equals: sale.id } }, orderBy: { timestamp: 'desc' } });
        res.json({ saleId: sale.id, receiptNo: sale.receiptNo, total: sale.total, products: returnOptions(sale, original?.details?.movements) });
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

// Refund Endpoint
router.post('/sales/refund/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, restockItems } = req.body;
        if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) return res.status(400).json({ error: 'A refund reason of 1 to 500 characters is required' });

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
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            const current = await tx.sale.findUnique({ where: { id } });
            const alreadyRestored = await tx.auditLog.findFirst({ where: { tenantId: req.tenantId, action: 'SALE_REFUND', details: { path: ['saleId'], equals: id } } });
            if (alreadyRestored) { const error = new Error('Return already recorded'); error.status = 409; throw error; }
            if (current.status !== 'finished') { const error = new Error('Sale is already refunded/voided'); error.status = 409; throw error; }
            const original = await tx.auditLog.findFirst({ where: { tenantId: req.tenantId, action: 'SALE_CREATE', details: { path: ['saleId'], equals: id } }, orderBy: { timestamp: 'desc' } });
            const movements = original?.details?.movements;
            if (!Array.isArray(movements)) { const error = new Error('Historical sale has no verified stock movements. Manual review is required before refund.'); error.status = 409; throw error; }
            const plan = planReturn(sale, movements, restockItems);
            for (const move of plan.restocks) {
                await tx.productStock.upsert({ where: { tenantId_branchId_productId: { tenantId: req.tenantId, branchId: sale.branchId, productId: move.productId } }, update: { qty: { increment: move.qty } }, create: { tenantId: req.tenantId, branchId: sale.branchId, productId: move.productId, qty: move.qty } });
            }
            await tx.sale.update({ where: { id }, data: { status: 'refunded', note: (current.note || '') + ' | Full financial return: ' + reason.trim() } });
            // A prepared meal cannot become usable ingredients again. Keep every
            // original stock movement and cost snapshot; record only the financial return.
        await tx.auditLog.create({
            data: {
                tenantId: req.tenantId,
                branchId: sale.branchId,
                userId: req.userId,
                action: 'SALE_REFUND',
                details: { saleId: id, reason: reason.trim(), total: sale.total, returnType: 'full_financial', restockItems: plan.restocks, retainedCost: plan.retainedCost, recoveredCost: plan.recoveredCost, stockRestored: plan.restocks.length > 0, consumedCostRetained: plan.retainedCost > 0 },
                ipAddress: req.ip
            }
        });

        });

        res.json({ success: true });
    } catch (err) {
        console.error('Refund Error:', err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// Update Sale (Used for finalizing online orders or updating notes/payment)
router.patch('/sales/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body || {};

        const sale = await prisma.sale.findUnique({
            where: { id }
        });

        if (!sale || sale.tenantId !== req.tenantId || sale.branchId !== req.branchId) return res.status(404).json({ error: 'Sale not found' });

        const prismaData = {};

        if (updateData.status !== undefined) prismaData.status = updateData.status;
        if (updateData.kitchenStatus !== undefined) prismaData.kitchenStatus = updateData.kitchenStatus;
        if (updateData.method !== undefined) prismaData.method = updateData.method;
        if (updateData.cashier !== undefined) prismaData.cashier = updateData.cashier;
        if (updateData.salesman !== undefined) prismaData.salesman = updateData.salesman;
        if (updateData.note !== undefined) prismaData.note = updateData.note;
        if (updateData.receiptNo !== undefined) prismaData.receiptNo = updateData.receiptNo;
        if (updateData.total !== undefined) prismaData.total = parseFloat(updateData.total);
        if (updateData.subtotal !== undefined) prismaData.subtotal = parseFloat(updateData.subtotal);
        if (updateData.discount !== undefined) prismaData.discount = parseFloat(updateData.discount);
        if (updateData.deliveryFee !== undefined) prismaData.deliveryFee = parseFloat(updateData.deliveryFee);
        if (updateData.tax !== undefined) prismaData.tax = parseFloat(updateData.tax);
        if (updateData.splitCash !== undefined) prismaData.splitCash = parseFloat(updateData.splitCash);
        if (updateData.splitCard !== undefined) prismaData.splitCard = parseFloat(updateData.splitCard);
        if (updateData.orderType !== undefined) prismaData.orderType = updateData.orderType;
        if (updateData.tableId !== undefined) prismaData.tableId = updateData.tableId;
        if (updateData.tableName !== undefined) prismaData.tableName = updateData.tableName;
        if (updateData.customer !== undefined) prismaData.customer = updateData.customer;
        if (updateData.date) prismaData.date = new Date(updateData.date);

        // Connect Shift relation properly in Prisma
        const targetShiftId = updateData.shiftId || (updateData.shift?.id);
        if (targetShiftId) {
            prismaData.shift = { connect: { id: targetShiftId } };
        } else if (updateData.shiftId === null) {
            prismaData.shift = { disconnect: true };
        }

        const updated = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            const current = await tx.sale.findUnique({ where: { id },include:{items:true} });
            if(!current || current.tenantId!==req.tenantId || current.branchId!==req.branchId) {const e=new Error('Sale not found');e.status=404;throw e;}
            if(targetShiftId) {const shift=await tx.shift.findFirst({where:{id:targetShiftId,tenantId:req.tenantId,branchId:req.branchId,status:'open'}});if(!shift){const e=new Error('Open shift in this branch required');e.status=409;throw e;}}
            if(prismaData.status==='finished' && current.status!=='finished') {
                const shift=await tx.shift.findFirst({where:{tenantId:req.tenantId,branchId:req.branchId,status:'open',...(targetShiftId?{id:targetShiftId}:{})}});
                if(!shift){const e=new Error('Open shift in this branch required');e.status=409;throw e;}
                prismaData.shift={connect:{id:shift.id}};
            }
            if(updateData.customer!==undefined) {prismaData.customer={...(updateData.customer||{})};delete prismaData.customer._stockSelections;if(current.customer?._stockSelections) prismaData.customer._stockSelections=current.customer._stockSelections;}
            const refund = await tx.auditLog.findFirst({ where: { tenantId: req.tenantId, action: 'SALE_REFUND', details: { path: ['saleId'], equals: id } } });
            if (refund || current.status === 'refunded' || current.status === 'void') { const error = new Error('Finalized reversal cannot be edited'); error.status = 409; throw error; }
            if(prismaData.status==='finished' && current.status!=='finished') {
                if(current.branchId!==req.branchId) {const e=new Error('Wrong branch');e.status=403;throw e;}
                const selections=current.customer?._stockSelections||[];
                if(current.source==='online_store' && (!Array.isArray(selections) || current.items.some(i=>!selections.some(s=>s.saleItemId===i.id&&String(s.productId)===String(i.productId))))) {
                    const error=new Error('This older online order is missing its saved size or add-on choices. Manual review is required before completing the sale.');error.status=409;error.code='LEGACY_SELECTION_REVIEW_REQUIRED';throw error;
                }
                const used=new Set();
                const items=snapshotItems(current.items.map(i=>{const index=selections.findIndex((s,n)=>!used.has(n)&&s.saleItemId===i.id&&String(s.productId)===String(i.productId));if(index>=0) used.add(index);return {...i,...(index>=0?selections[index]:{}),saleItemId:i.id};}),await readCatalog(tx,req.tenantId));
                const movements=await applyStock(tx,req.tenantId,req.branchId,items);
                for(const item of items) await tx.saleItem.update({where:{id:item.saleItemId},data:{cost:item.cost}});
                await tx.auditLog.create({data:{tenantId:req.tenantId,branchId:req.branchId,userId:req.userId,action:'SALE_CREATE',details:{saleId:id,movements},ipAddress:req.ip}});
            } else if(current.status==='finished' && prismaData.status && prismaData.status!=='finished') {const e=new Error('Use the refund flow to reverse a finished sale');e.status=409;throw e;}
            const updated=await tx.sale.update({ where: { id }, data: prismaData,include:{items:true} });
            return {...updated,newlyFinished:current.status!=='finished' && updated.status==='finished'};
        });

        // Also update daily summary if finalizing sale
        if (updated.newlyFinished) {
            updateDailySummary(req, updated).catch(e => console.error('Summary Update Error:', e));
        }

        res.json({ success: true, sale: updated });
    } catch (err) {
        console.error('Sale Update Error:', err);
        res.status(err.status || 500).json({ error: err.message, code: err.code });
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
                status: { notIn: ['void', 'refunded', 'cancelled', 'rejected'] }
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
                status: {notIn:['void','refunded','cancelled','rejected']},
                OR: [
                    { source: 'online_store', status: 'pending' },
                    { source: 'online_store', kitchenStatus: 'pending' },
                    { source: 'aggregator', kitchenStatus:'pending' },
                    { source: 'online', status: 'pending' }
                ]
            },
            include: { items: true },
            orderBy: { date: 'desc' }
        });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Sale-level kitchen state changes share the tenant lock with refund/finalization.
for (const action of ['complete','preparing']) router.post('/kitchen/'+action+'/:id',async(req,res)=>{
    try {
        const result=await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            const sale=await tx.sale.findUnique({where:{id:req.params.id}});
            const fail=(message,status)=>{const err=new Error(message);err.status=status;throw err};
            if(!sale || sale.tenantId!==req.tenantId || sale.branchId!==req.branchId) fail('Order not found',404);
            if(['void','refunded','cancelled','rejected'].includes(sale.status)) fail('Order is not active',409);
            const kitchenStatus=action==='preparing'?'preparing':sale.source==='online_store'?'out_for_delivery':'ready';
            if(action==='preparing' && !['pending','preparing'].includes(sale.kitchenStatus)) fail('Order is no longer pending preparation',409);
            if(action==='complete' && !['pending','preparing','ready','out_for_delivery'].includes(sale.kitchenStatus)) fail('Order is no longer in kitchen',409);
            if(sale.kitchenStatus!==kitchenStatus) await tx.sale.update({where:{id:sale.id},data:{kitchenStatus}});
            return {success:true,status:kitchenStatus};
        });res.json(result);
    } catch(err) {res.status(err.status||500).json({error:err.message});}
});

// === INVENTORY MANAGEMENT ===

// Save material metadata/entered branch balance and one linked credit purchase atomically.
router.post('/inventory/material', async (req, res) => {
    try {
        const material = req.body.material;
        if (!material || material.id == null || !material.name || !Number.isFinite(Number(material.cost)) || Number(material.cost) < 0 || !Number.isFinite(Number(material.stock))) return res.status(400).json({ error: 'Invalid material' });
        const result = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            const doc = await tx.data.findUnique({ where: { key_tenantId: { key: 'ingredients', tenantId: req.tenantId } } });
            const ingredients = doc ? (typeof doc.value === 'string' ? JSON.parse(doc.value) : doc.value) : [];
            const index = ingredients.findIndex(i => String(i.id) === String(material.id));
            const existing = index >= 0 ? ingredients[index] : null;
            if (existing && req.body.expectedUpdatedAt !== undefined && (existing.updatedAt || null) !== req.body.expectedUpdatedAt) { const error = new Error('Material changed. Reload before saving.'); error.status = 409; throw error; }
            if (existing && (existing.stockRevision || null) !== (req.body.expectedStockRevision || null)) { const error = new Error('Stock changed. Reload before saving.'); error.status = 409; throw error; }
            const previousStock = Number(existing?.stockByBranch?.[req.branchId] ?? existing?.stock ?? 0);
            const stockByBranch = { ...(existing?.stockByBranch || {}), [req.branchId]: Number(material.stock) };
            const next = { ...existing, ...material, stockRevision: crypto.randomUUID(), stockByBranch, stock: Object.values(stockByBranch).reduce((sum,n)=>sum+Number(n),0), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
            const purchasedQty = Math.max(0, Number(material.stock) - previousStock);
            if (material.vendorId && purchasedQty > 0) {
                const vendor = await tx.vendor.findFirst({ where: { id: String(material.vendorId), tenantId: req.tenantId } });
                if (!vendor) throw new Error('Vendor not found');
                const amount = purchasedQty * Number(material.cost);
                const key = 'vendor_transactions_' + vendor.id;
                const ledger = await tx.data.findUnique({ where: { key_tenantId: { key, tenantId: req.tenantId } } });
                const transactions = ledger ? (typeof ledger.value === 'string' ? JSON.parse(ledger.value) : ledger.value) : [];
                transactions.push({ id: crypto.randomUUID(), vendorId: vendor.id, type: 'purchase', amount, description: 'Material purchase: ' + material.name, date: new Date().toISOString().slice(0,10), method: 'credit', createdAt: new Date().toISOString() });
                const value = JSON.stringify(transactions);
                await tx.data.upsert({ where: { key_tenantId: { key, tenantId: req.tenantId } }, update: { value }, create: { key, tenantId: req.tenantId, value } });
                await tx.vendor.update({ where: { id: vendor.id }, data: { credit: { increment: amount } } });
            }
            if (index >= 0) ingredients[index] = next; else ingredients.push(next);
            const value = JSON.stringify(ingredients);
            await tx.data.upsert({ where: { key_tenantId: { key: 'ingredients', tenantId: req.tenantId } }, update: { value }, create: { key: 'ingredients', tenantId: req.tenantId, value } });
            return ingredients;
        });
        res.json({ success: true, ingredients: result });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// 0. Restock Raw Material — Full Financial Flow
router.post('/inventory/restock', async (req, res) => {
    try {
        const {
            ingredientId,
            ingredientName,
            ingredientUnit,
            vendorId,
            qty,
            unitCost,
            purchaseType,   // 'credit' | 'paid_now'
            paymentMethod,  // 'cash' | 'card' | 'mobile' — only used when paid_now
            notes
        } = req.body;

        if (!ingredientId || !qty || qty <= 0 || !unitCost || unitCost < 0) {
            return res.status(400).json({ error: 'Missing or invalid required fields' });
        }

        const totalCost = parseFloat(qty) * parseFloat(unitCost);
        const today = new Date().toISOString().split('T')[0];
        const description = `Raw Material Purchase: ${ingredientName || ingredientId} (${qty} ${ingredientUnit || ''} × ${parseFloat(unitCost).toFixed(2)})`;

        await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            // 1. Read ingredients blob and update stock for this branch
            const ingData = await tx.data.findUnique({
                where: { key_tenantId: { key: 'ingredients', tenantId: req.tenantId } }
            });

            let ingredients = [];
            if (ingData && ingData.value) {
                ingredients = typeof ingData.value === 'string' ? JSON.parse(ingData.value) : ingData.value;
                if (!Array.isArray(ingredients)) ingredients = [];
            }

            let idx = ingredients.findIndex(i => String(i.id) === String(ingredientId));
            if (idx === -1) {
                // Ingredient record doesn't exist in server DB yet: initialize it
                ingredients.push({
                    id: isNaN(ingredientId) ? ingredientId : parseInt(ingredientId),
                    name: ingredientName || 'Raw Material',
                    unit: ingredientUnit || 'units',
                    cost: parseFloat(unitCost),
                    stock: 0,
                    stockByBranch: {},
                    vendorId: vendorId || null
                });
                idx = ingredients.length - 1;
            }

            // Branch-aware stock update
            if (!ingredients[idx].stockByBranch) ingredients[idx].stockByBranch = {};
            const branchKey = req.branchId || 'default';
            const currentBranchStock = parseFloat(ingredients[idx].stockByBranch[branchKey] ?? ingredients[idx].stock ?? 0);
            ingredients[idx].stockByBranch[branchKey] = currentBranchStock + parseFloat(qty);

            // Weighted average cost update
            const oldTotalStock = parseFloat(ingredients[idx].stock || 0);
            const oldCost = parseFloat(ingredients[idx].cost || 0);
            const newQty = parseFloat(qty);
            if (oldTotalStock > 0) {
                ingredients[idx].cost = parseFloat(
                    ((oldTotalStock * oldCost + newQty * parseFloat(unitCost)) / (oldTotalStock + newQty)).toFixed(4)
                );
            } else {
                ingredients[idx].cost = parseFloat(unitCost);
            }

            // Keep flat stock as sum of all branches
            ingredients[idx].stock = Object.values(ingredients[idx].stockByBranch)
                .reduce((sum, v) => sum + parseFloat(v || 0), 0);
            ingredients[idx].lastRestockDate = new Date().toISOString();
            ingredients[idx].stockRevision = crypto.randomUUID();
            if (vendorId) ingredients[idx].vendorId = vendorId;

            await tx.data.upsert({
                where: { key_tenantId: { key: 'ingredients', tenantId: req.tenantId } },
                update: { value: JSON.stringify(ingredients), updatedAt: new Date() },
                create: { key: 'ingredients', tenantId: req.tenantId, value: JSON.stringify(ingredients) }
            });

            const targetBranchId = req.branchId || req.body.branchId || null;

            // 2. Log as InventoryAdjustment (PURCHASE) - Safe execution
            if (req.userId && targetBranchId) {
                try {
                    const validBranch = await tx.branch.findFirst({
                        where: { id: targetBranchId, tenantId: req.tenantId },
                        select: { id: true }
                    });
                    const validUser = await tx.user.findFirst({
                        where: { id: req.userId, tenantId: req.tenantId },
                        select: { id: true }
                    });
                    if (validBranch && validUser) {
                        await tx.inventoryAdjustment.create({
                            data: {
                                tenantId: req.tenantId,
                                branchId: validBranch.id,
                                itemId: String(ingredientId),
                                type: 'PURCHASE',
                                qty: parseFloat(qty),
                                unitCost: parseFloat(unitCost),
                                totalCost,
                                reason: notes || (purchaseType === 'credit' ? 'Credit Purchase' : `Cash Purchase — paid ${paymentMethod || 'cash'}`),
                                referenceId: vendorId ? `VENDOR-${vendorId}` : null,
                                createdById: validUser.id
                            }
                        });
                    }
                } catch (adjErr) {
                    console.warn('[Restock] Optional InventoryAdjustment skipped:', adjErr.message);
                }
            }

            // 3. Create Expense record ONLY IF paid_now (Credit purchases do NOT create expense until actually paid to vendor)
            if (purchaseType === 'paid_now') {
                try {
                    await tx.expense.create({
                        data: {
                            description,
                            amount: totalCost,
                            date: today,
                            seller: vendorId ? String(vendorId) : null,
                            method: paymentMethod || 'cash',
                            notes: notes || null,
                            category: 'Raw Materials',
                            type: 'expense',
                            tenantId: req.tenantId,
                            branchId: targetBranchId || req.branchId || 'default',
                            createdBy: req.userId || 'system'
                        }
                    });
                } catch (expErr) {
                    console.warn('[Restock] Optional Expense record skipped:', expErr.message);
                }
            } else {
                // Credit purchase: Clean up any mistakenly recorded credit expense for raw materials
                try {
                    await tx.expense.deleteMany({
                        where: {
                            tenantId: req.tenantId,
                            category: 'Raw Materials',
                            method: 'credit'
                        }
                    });
                } catch (delErr) {}
            }

            // 4. Vendor ledger & balance: update vendor credit & transaction log
            if (vendorId) {
                // Find vendor by ID or name
                let foundVendor = await tx.vendor.findFirst({
                    where: {
                        tenantId: req.tenantId,
                        OR: [
                            { id: String(vendorId) },
                            { name: String(vendorId) }
                        ]
                    }
                });

                // Auto-create vendor in DB if not existing yet (e.g. from client offline or imported)
                if (!foundVendor) {
                    console.log(`[Restock] Auto-creating Vendor '${vendorId}' in DB for tenant ${req.tenantId}`);
                    try {
                        foundVendor = await tx.vendor.create({
                            data: {
                                id: (typeof vendorId === 'string' && vendorId.length === 36) ? vendorId : undefined,
                                name: String(vendorId),
                                credit: 0,
                                tenantId: req.tenantId,
                                branchId: targetBranchId || null
                            }
                        });
                    } catch (createErr) {
                        // Might conflict if concurrent create, try find again
                        foundVendor = await tx.vendor.findFirst({
                            where: { tenantId: req.tenantId, name: String(vendorId) }
                        });
                    }
                }

                const canonicalVendorId = foundVendor?.id || String(vendorId);
                const vendorTxKey = `vendor_transactions_${canonicalVendorId}`;

                const existingData = await tx.data.findUnique({
                    where: { key_tenantId: { key: vendorTxKey, tenantId: req.tenantId } }
                });
                let transactions = existingData
                    ? (typeof existingData.value === 'string' ? JSON.parse(existingData.value) : existingData.value)
                    : [];
                if (!Array.isArray(transactions)) transactions = [];

                // Row 1: Purchase (always)
                transactions.push({
                    id: `${Date.now()}-purchase`,
                    vendorId: canonicalVendorId,
                    type: 'purchase',
                    amount: totalCost,
                    description,
                    date: today,
                    method: purchaseType === 'paid_now' ? (paymentMethod || 'cash') : 'credit',
                    createdAt: new Date().toISOString()
                });

                // Row 2: Payment (only if paid_now)
                if (purchaseType === 'paid_now') {
                    transactions.push({
                        id: `${Date.now()}-payment`,
                        vendorId: canonicalVendorId,
                        type: 'payment',
                        amount: totalCost,
                        description: `Payment: ${ingredientName || ingredientId} restock (${paymentMethod || 'cash'})`,
                        date: today,
                        method: paymentMethod || 'cash',
                        createdAt: new Date().toISOString()
                    });
                }

                // Save to canonical key
                await tx.data.upsert({
                    where: { key_tenantId: { key: vendorTxKey, tenantId: req.tenantId } },
                    update: { value: JSON.stringify(transactions), updatedAt: new Date() },
                    create: { key: vendorTxKey, tenantId: req.tenantId, value: JSON.stringify(transactions) }
                });

                // If vendorId string was different from canonical ID (e.g. name or different ID), mirror to that key too
                if (String(vendorId) !== canonicalVendorId) {
                    const altTxKey = `vendor_transactions_${vendorId}`;
                    await tx.data.upsert({
                        where: { key_tenantId: { key: altTxKey, tenantId: req.tenantId } },
                        update: { value: JSON.stringify(transactions), updatedAt: new Date() },
                        create: { key: altTxKey, tenantId: req.tenantId, value: JSON.stringify(transactions) }
                    });
                }

                // 5. Update Vendor.credit in database
                if (foundVendor && purchaseType === 'credit') {
                    await tx.vendor.update({
                        where: { id: foundVendor.id },
                        data: { credit: { increment: totalCost } }
                    });
                    console.log(`[Restock] ✅ Vendor '${foundVendor.name}' (${foundVendor.id}) credit incremented by ${totalCost}`);
                }
            }
        });

        res.json({ success: true, totalCost });
    } catch (err) {
        console.error('Restock Error:', err);
        res.status(500).json({ error: err.message });
    }
});


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
                    createdById: req.userId  // ✅ Fixed: was 'createdBy' (wrong field name)
                }
            });

            // ✅ Note: We do NOT touch productStock here — ingredients are tracked
            // in the frontend local DB (window.DB.saveIngredient), not in productStock.
            // productStock is only used for finished POS menu products.

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
            // ✅ Note: We do NOT check productStock for ingredients.
            // Ingredient stock is tracked in the frontend local DB (window.DB.saveIngredient).
            // We only log the transfer via InventoryAdjustment records.

            // Log: Transfer Out from source branch
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
                    createdById: req.userId  // ✅ Fixed: was 'createdBy'
                }
            });

            // Log: Transfer In to target branch
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
                    createdById: req.userId  // ✅ Fixed: was 'createdBy'
                }
            });
        });

        res.json({ success: true, referenceId });
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

// Expense reports are read-only and branch-explicit; never call legacy cleanup.
router.get('/reports/expenses', async (req,res)=>{
    try {
        const branchId=req.query.branchId || req.branchId;
        const where={tenantId:req.tenantId,method:{not:'credit'}};
        if(branchId!=='all') where.branchId=branchId;
        if(!['admin','SUPER_ADMIN'].includes(req.user.role)) {
            const allowed=req.user.branchIds?.length?req.user.branchIds:[req.branchId];
            if(branchId==='all')where.branchId={in:allowed};
            else if(!allowed.includes(branchId))return res.status(403).json({error:'Branch access denied'});
        }
        if(!/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) return res.status(400).json({error:'Calendar dates required'});
        where.date={gte:req.query.from,lte:req.query.to+'T23:59:59.999Z'};
        res.json(await prisma.expense.findMany({where,orderBy:[{date:'asc'},{id:'asc'}]}));
    }catch(error){res.status(500).json({error:error.message});}
});

// Inventory report scopes balances explicitly, independently of the active POS header.
router.get('/reports/inventory', async (req, res) => {
    try {
        const requested = req.query.branchId || req.branchId;
        const allowed = ['admin', 'SUPER_ADMIN'].includes(req.user.role) ? null : (req.user.branchIds?.length ? req.user.branchIds : [req.branchId]);
        const branches = await prisma.branch.findMany({ where:{tenantId:req.tenantId, ...(requested === 'all' ? (allowed ? {id:{in:allowed}} : {}) : {id:requested})}, select:{id:true} });
        if (!branches.length || (allowed && requested !== 'all' && !allowed.includes(requested))) return res.status(403).json({error:'Branch access denied'});
        const ids = branches.map(branch=>branch.id);
        const [catalog, doc, stocks] = await Promise.all([readCatalog(prisma,req.tenantId), prisma.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId:req.tenantId}}}), prisma.productStock.findMany({where:{tenantId:req.tenantId,branchId:{in:ids}}})]);
        const ingredients = typeof doc?.value === 'string' ? JSON.parse(doc.value) : (doc?.value || []);
        const publicInventoryFields = item => ({ id:item.id, name:item.name, category:item.category, type:item.type, itemType:item.itemType, cost:item.cost, unitCost:item.unitCost, price:item.price, minStock:item.minStock, createdAt:item.createdAt, updatedAt:item.updatedAt, lastSoldAt:item.lastSoldAt, lastUsedAt:item.lastUsedAt });
        const products = catalog.map(product=>({...publicInventoryFields(product), stock:stocks.filter(stock=>stock.productId===String(product.id)).reduce((sum,stock)=>sum+stock.qty,0)}));
        const scopedIngredients = ingredients.map(ingredient=>{
            if (!ingredient.stockByBranch && (requested !== 'all' || allowed)) return {...publicInventoryFields(ingredient), stock:0, stockUnknown:true};
            const stock=ingredient.stockByBranch ? ids.reduce((sum,id)=>sum+Number(ingredient.stockByBranch[id] || 0),0) : Number(ingredient.stock || 0);
            return {...publicInventoryFields(ingredient),stock,stockByBranch:ingredient.stockByBranch ? Object.fromEntries(ids.map(id=>[id,Number(ingredient.stockByBranch[id] || 0)])) : undefined};
        });
        res.json({products,ingredients:scopedIngredients,unknownBalances:scopedIngredients.some(ingredient=>ingredient.stockUnknown)});
    } catch(error) {res.status(500).json({error:error.message});}
});

// Financial return events use the immutable audit timestamp, not the original sale date.
router.get('/reports/return-events', async (req, res) => {
    try {
        const branchId = req.query.branchId || req.branchId;
        const where = { tenantId: req.tenantId, action: 'SALE_REFUND' };
        if (branchId !== 'all') where.branchId = branchId;
        else if (!['admin', 'SUPER_ADMIN'].includes(req.user.role)) where.branchId = { in: req.user.branchIds?.length ? req.user.branchIds : [req.branchId] };
        if (branchId !== 'all' && branchId !== req.branchId && !['admin', 'SUPER_ADMIN'].includes(req.user.role) && !(req.user.branchIds || []).includes(branchId)) return res.status(403).json({ error: 'Branch access denied' });
        if (!req.query.from || !req.query.to) return res.status(400).json({ error: 'Report date range is required' });
        const from = new Date(req.query.from), to = new Date(req.query.to);
        if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return res.status(400).json({ error: 'Invalid date range' });
        where.timestamp = { gte: from, lte: to };
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1), limit = 500;
        const [total, logs] = await Promise.all([prisma.auditLog.count({ where }), prisma.auditLog.findMany({ where, orderBy: [{timestamp:'asc'}, {id:'asc'}], skip:(page-1)*limit, take:limit, select:{id:true,timestamp:true,branchId:true,details:true} })]);
        res.json({ total, events: logs.map(log => ({ id:log.id, date:log.timestamp, branchId:log.branchId, saleId:log.details?.saleId, total:log.details?.total, recoveredCost:Number.isFinite(log.details?.recoveredCost) ? log.details.recoveredCost : null, retainedCost:Number.isFinite(log.details?.retainedCost) ? log.details.retainedCost : null })) });
    } catch (error) { res.status(500).json({ error:error.message }); }
});

// 2. Sales History (Paginated)
router.get('/reports/history', async (req, res) => {
    try {
        const { tenantId } = req;
        const queryBranchId = req.query.branchId;
        
        let { page = 1, limit = 50, from, to, cashier, status } = req.query;
        page = Math.max(1, Number.parseInt(page, 10) || 1);
        limit = Math.min(5000, Math.max(1, Number.parseInt(limit, 10) || 50));

        const filter = { tenantId };
        if (req.query.asOf) {
            const asOf=new Date(req.query.asOf);
            if(!Number.isFinite(asOf.getTime()))return res.status(400).json({error:'Invalid snapshot time'});
            filter.createdAt={lte:asOf};
        }
        
        if (queryBranchId && queryBranchId !== 'all') {
            filter.branchId = queryBranchId;
        } else if (req.branchId && queryBranchId !== 'all') {
            filter.branchId = req.branchId;
        }

        if (req.user.role !== 'admin' && req.user.role !== 'SUPER_ADMIN') {
            if (queryBranchId === 'all') filter.branchId = { in: req.user.branchIds?.length ? req.user.branchIds : [req.branchId] };
            else if (filter.branchId !== req.branchId && !(req.user.branchIds || []).includes(filter.branchId)) return res.status(403).json({ error: 'Branch access denied' });
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
            where: { ...filter, status: 'finished' },
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
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
            include: { items: true }
        });

        const returnLogs = sales.length ? await prisma.auditLog.findMany({ where: { tenantId, action: 'SALE_REFUND', OR: sales.map(sale => ({ details: { path: ['saleId'], equals: sale.id } })) }, select: { details: true } }) : [];
        const returnFacts = new Map(returnLogs.map(log => [log.details?.saleId, log.details]));
        for (const sale of sales) {
            const facts = returnFacts.get(sale.id);
            if (sale.status === 'refunded' && facts) sale.returnInfo = {
                returnType: facts.returnType || 'legacy_unspecified',
                stockRestored: typeof facts.stockRestored === 'boolean' ? facts.stockRestored : null,
                consumedCostRetained: facts.consumedCostRetained === true,
                retainedCost: Number.isFinite(facts.retainedCost) ? facts.retainedCost : null
            };
        }
        res.json({ total, page, pages: Math.ceil(total / limit), summary, sales });
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
        // Only new deterministic KOT identities need their immutable receipt metadata.
        // Ordinary receipts retain the original dependency-free read path.
        if(sale.id.startsWith('REC-KOT-')){
            if(sale.branchId!==req.branchId)return res.status(404).json({error:'Receipt not found'});
            const doc=await prisma.data.findUnique({where:{key_tenantId:{key:'kitchen_draft_v1:'+sale.id.slice(8),tenantId:req.tenantId}}});
            const draft=doc?(typeof doc.value==='string'?JSON.parse(doc.value):doc.value):null;
            if(!draft||draft.saleId!==sale.id||draft.branchId!==sale.branchId)return res.status(409).json({error:'Draft receipt metadata needs review'});
            return res.json(require('./kitchen-drafts').receipt(sale,draft));
        }
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
