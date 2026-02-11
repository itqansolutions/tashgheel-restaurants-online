const express = require('express');
const router = express.Router();
const storage = require('../utils/storage');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Models
const ProductStock = require('../models/ProductStock');
const Shift = require('../models/Shift');
const Sale = require('../models/Sale');
const DailySummary = require('../models/DailySummary');
const Branch = require('../models/Branch');

// === Data Storage Endpoints ===

// Save Data (Replace `saveData` command)
router.post('/data/save', async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Key is required' });

    try {
        await storage.saveData(key, value, req.tenantId);
        res.json({ success: true });
    } catch (err) {
        console.error(`Error saving ${key}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Read Data (Filtered by Branch for Sales)
router.get('/data/read/:key', async (req, res) => {
    const { key } = req.params;
    try {
        const rawData = await storage.readData(key, req.tenantId);

        // Branch Enforcement for Sales/Receipts
        if (req.branchId && (key === 'sales' || key.startsWith('receipts'))) {
            if (!rawData) return res.json([]);

            let data = [];
            try { data = JSON.parse(rawData); } catch (e) { data = []; }

            if (Array.isArray(data)) {
                // Filter by Branch ID
                const filtered = data.filter(item => {
                    return item.branchId === req.branchId;
                });
                return res.json(filtered);
            }
        }

        // Branch Stock Merging for Products
        if (req.branchId && (key === 'spare_parts' || key === 'products')) {
            let products = [];
            try { products = JSON.parse(rawData || '[]'); } catch (e) { products = []; }

            // Fetch real stock
            try {
                // Hard check to avoid CastError
                if (!/^[0-9a-fA-F]{24}$/.test(req.branchId)) {
                    console.error('Bypassing merge: Invalid branchId format:', req.branchId);
                    return res.json(products);
                }

                const stocks = await ProductStock.find({
                    tenantId: req.tenantId,
                    branchId: req.branchId
                });

                const stockMap = {};
                stocks.forEach(s => stockMap[s.productId.toString()] = s.qty);

                products.forEach(p => {
                    p.stock = stockMap[p.id] || 0;
                });
                return res.json(products);

            } catch (e) {
                console.error('Stock Merge Error', e);
                return res.json(products);
            }
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
        const files = await storage.listDataFiles(req.tenantId);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check File Exists
router.post('/file/exists', async (req, res) => {
    const { filename } = req.body;
    const exists = await storage.checkFileExists(filename, req.tenantId);
    res.json(exists);
});

// === SHIFT MANAGEMENT ===

// 1. Get Current Shift
router.get('/shifts/current', async (req, res) => {
    try {
        console.log('🔍 Checking Current Shift:', {
            tenantId: req.tenantId,
            branchId: req.branchId,
            userId: req.userId
        });
        const shift = await Shift.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            cashierId: req.userId,
            status: 'open'
        });
        res.json({ shift });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Open Shift
router.post('/shifts/open', async (req, res) => {
    try {
        const { openingCash } = req.body;

        const existing = await Shift.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            cashierId: req.userId,
            status: 'open'
        });

        if (existing) return res.status(400).json({ error: 'You already have an open shift' });

        const newShift = new Shift({
            tenantId: req.tenantId,
            branchId: req.branchId,
            cashierId: req.userId,
            openingCash: parseFloat(openingCash || 0)
        });

        await newShift.save();
        res.json({ success: true, shift: newShift });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Close Shift
router.post('/shifts/close', async (req, res) => {
    try {
        const { closingCash, shiftId, notes } = req.body;

        const shift = await Shift.findById(shiftId);
        if (!shift || shift.status !== 'open') return res.status(404).json({ error: 'Shift not found or already closed' });

        const sales = await Sale.aggregate([
            { $match: { shiftId: shift._id, status: 'finished' } },
            {
                $group: {
                    _id: null,
                    cashTotal: { $sum: { $cond: [{ $eq: ["$method", "cash"] }, "$total", 0] } },
                    cardTotal: { $sum: { $cond: [{ $eq: ["$method", "card"] }, "$total", 0] } },
                    mobileTotal: { $sum: { $cond: [{ $eq: ["$method", "mobile"] }, "$total", 0] } },
                    totalSales: { $sum: "$total" }
                }
            }
        ]);

        const stats = sales[0] || { cashTotal: 0, cardTotal: 0, mobileTotal: 0, totalSales: 0 };
        const voids = await Sale.countDocuments({ shiftId: shift._id, status: 'void' });
        const voidsValue = await Sale.aggregate([
            { $match: { shiftId: shift._id, status: 'void' } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);

        shift.closedAt = new Date();
        shift.status = 'closed';
        shift.closingCash = parseFloat(closingCash || 0);
        shift.expectedCash = shift.openingCash + stats.cashTotal;
        shift.difference = shift.closingCash - shift.expectedCash;
        shift.notes = notes || "";

        if (req.userId.toString() !== shift.cashierId.toString()) {
            shift.forcedBy = req.userId;
            shift.status = 'force-closed';
        }

        shift.totals = {
            ...stats,
            voidsCount: voids,
            voidsValue: voidsValue[0]?.total || 0
        };

        await shift.save();
        res.json({ success: true, shift });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === SALES ===


const AuditLog = require('../models/AuditLog');

router.post('/sales', async (req, res) => {
    try {
        const saleData = req.body;
        if (!saleData || !saleData.items) return res.status(400).json({ error: 'Invalid Sale Data' });

        saleData.branchId = req.branchId;
        saleData.tenantId = req.tenantId;

        const activeShift = await Shift.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            cashierId: req.userId,
            status: 'open'
        });
        if (!activeShift) return res.status(403).json({ error: 'No open shift found. Please open a shift first.' });
        saleData.shiftId = activeShift._id;

        // Apply Costs
        try {
            const masterDataRaw = await storage.readData('spare_parts', req.tenantId);
            const masterProducts = JSON.parse(masterDataRaw || '[]');
            const costMap = {};
            masterProducts.forEach(p => costMap[String(p.id)] = p.cost || 0);

            saleData.items.forEach(item => {
                item.cost = costMap[String(item.id)] || 0;
            });
        } catch (e) { console.error('Cost Snapshot Error:', e); }

        const newSale = new Sale(saleData);
        await newSale.save();

        // 🟢 ATOMICITY IMPROVEMENT: Sequentially deduct stock, rollback on failure
        const deductedItems = [];
        try {
            for (const item of saleData.items) {
                await deductStock(req.tenantId, req.branchId, item.id, item.qty);
                deductedItems.push({ id: item.id, qty: item.qty });
                if (item.addons && item.addons.length > 0) {
                    for (const addon of item.addons) {
                        await deductStock(req.tenantId, req.branchId, addon.id, item.qty);
                        deductedItems.push({ id: addon.id, qty: item.qty });
                    }
                }
            }
        } catch (stockErr) {
            console.error('❌ Critical Stock Error. Rolling back sale...', stockErr);
            // Rollback: Delete Sale
            await Sale.deleteOne({ _id: newSale._id });
            // Rollback: Restore Stock (Reverse what succeeded)
            for (const rolledItem of deductedItems) {
                await restoreStock(req.tenantId, req.branchId, rolledItem.id, rolledItem.qty);
            }
            return res.status(500).json({ error: 'Transaction Failed (Stock Error). Sale was rolled back.' });
        }

        // Legacy + Async Updates (Non-blocking)
        storage.insert('sales', saleData).catch(e => console.error('Legacy Save Error:', e));
        updateDailySummary(req, newSale).catch(e => console.error('Summary Update Error:', e));

        // 🟢 AUDIT LOG
        AuditLog.create({
            tenantId: req.tenantId,
            branchId: req.branchId,
            userId: req.userId,
            action: 'SALE_CREATE',
            details: { saleId: newSale._id, total: newSale.total, itemsCount: newSale.items.length },
            ipAddress: req.ip
        });

        res.json({ success: true, id: newSale.id });

    } catch (err) {
        console.error('Sale Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 🟢 NEW: Refund Endpoint
router.post('/sales/refund/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const sale = await Sale.findOne({ _id: id, tenantId: req.tenantId, branchId: req.branchId });
        if (!sale) return res.status(404).json({ error: 'Sale not found' });

        if (sale.status === 'refunded' || sale.status === 'void') {
            return res.status(400).json({ error: 'Sale is already refunded/voided' });
        }

        // 1. Mark as Refunded
        sale.status = 'refunded';
        sale.refundReason = reason || 'Customer Return';
        sale.refundedAt = new Date();
        sale.refundedBy = req.userId;
        await sale.save();

        // 2. Restore Stock
        for (const item of sale.items) {
            await restoreStock(req.tenantId, req.branchId, item.id, item.qty);
            if (item.addons) {
                for (const addon of item.addons) {
                    await restoreStock(req.tenantId, req.branchId, addon.id, item.qty);
                }
            }
        }

        // 3. Update Summary (Negative/Reverse)
        // We can re-use updateDailySummary logic but handle 'isRefund' flag within it
        // Or specific revert logic. The existing summary logic handles isVoid/isRefund by adding 0.
        // But to correct PAST summary, we need $inc negative values.
        // For simplicity, let's just log it. Real-time reports query live data anyway.
        // DailySummary.update... ($inc: { totalRevenue: -sale.total })

        // 4. Audit Log
        AuditLog.create({
            tenantId: req.tenantId,
            branchId: req.branchId,
            userId: req.userId,
            action: 'SALE_REFUND',
            details: { saleId: sale._id, reason: reason, total: sale.total },
            ipAddress: req.ip
        });

        res.json({ success: true });

    } catch (err) {
        console.error('Refund Error:', err);
        res.status(500).json({ error: err.message });
    }
});

async function updateDailySummary(req, newSale) {
    try {
        const branch = await Branch.findById(req.branchId);
        const timezone = branch?.settings?.timezone || 'Africa/Cairo';
        const branchDateStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });

        const isVoid = newSale.status === 'void';
        const isRefund = newSale.status === 'refunded';

        const update = {
            $inc: {
                totalRevenue: (isVoid || isRefund) ? 0 : newSale.total,
                totalOrders: (isVoid || isRefund) ? 0 : 1,
                totalDiscount: (isVoid || isRefund) ? 0 : (newSale.discount || 0),
                totalTax: (isVoid || isRefund) ? 0 : (newSale.tax || 0),
                totalCost: (isVoid || isRefund) ? 0 : newSale.items.reduce((sum, i) => sum + ((i.cost || 0) * (i.qty || 0)), 0),
                voidsCount: isVoid ? 1 : 0,
                voidsValue: isVoid ? newSale.total : 0
            }
        };

        if (!isVoid && !isRefund) {
            const methodKey = `${(newSale.method || 'cash').toLowerCase()}Total`;
            if (['cashTotal', 'cardTotal', 'mobileTotal'].includes(methodKey)) {
                update.$inc[methodKey] = newSale.total;
            }
        }

        await DailySummary.findOneAndUpdate(
            { tenantId: req.tenantId, branchId: req.branchId, date: branchDateStr },
            update,
            { upsert: true, new: true }
        );
    } catch (e) { console.error('Summary Update Error:', e); }
}

async function restoreStock(tenantId, branchId, productId, qty) {
    try {
        let stock = await ProductStock.findOne({ tenantId, branchId, productId });
        if (stock) {
            stock.qty += qty;
            await stock.save();
        }
    } catch (e) { console.error('Stock restore error', e); }
}


// === KITCHEN DISPLAY SYSTEM ===

// 1. Get Pending Kitchen Orders
router.get('/kitchen/orders', async (req, res) => {
    try {
        const { branchId, tenantId } = req;

        // Find orders where kitchenStatus is 'pending' AND status is NOT void/refunded
        const orders = await Sale.find({
            tenantId,
            branchId,
            kitchenStatus: 'pending',
            status: { $nin: ['void', 'refunded'] }
        }).sort({ date: 1 }); // Oldest first (FIFO)

        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Mark Order as Complete
router.post('/kitchen/complete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sale = await Sale.findOne({
            _id: id,
            tenantId: req.tenantId,
            branchId: req.branchId
        });

        if (!sale) return res.status(404).json({ error: 'Order not found' });

        sale.kitchenStatus = 'ready';
        sale.kitchenCompletedAt = new Date();
        await sale.save();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function deductStock(tenantId, branchId, productId, qty) {
    try {
        let stock = await ProductStock.findOne({ tenantId, branchId, productId });
        if (!stock) {
            stock = new ProductStock({ tenantId, branchId, productId, qty: 0 });
        }
        stock.qty -= qty;
        await stock.save();
    } catch (e) {
        console.error(`Stock update failed for ${productId}:`, e);
    }
}

// Set Stock (Absolute)
router.post('/inventory/set', async (req, res) => {
    try {
        const { productId, qty } = req.body;
        if (!productId || qty === undefined) return res.status(400).json({ error: 'Missing Data' });

        let stock = await ProductStock.findOne({ tenantId: req.tenantId, branchId: req.branchId, productId: productId.toString() });
        if (!stock) {
            stock = new ProductStock({
                tenantId: req.tenantId,
                branchId: req.branchId,
                productId: productId.toString(),
                qty: parseFloat(qty)
            });
        } else {
            stock.qty = parseFloat(qty);
        }
        await stock.save();
        res.json({ success: true });
    } catch (err) {
        console.error('Inventory Set Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === Utilities ===
router.post('/utils/ensure-data-dir', async (req, res) => {
    await storage.ensureDataDir();
    res.json(true);
});

// === Reporting Endpoints ===

// 1. Live Sales Monitor
router.get('/reports/live', async (req, res) => {
    try {
        const { branchId, tenantId } = req;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = await Sale.aggregate([
            { $match: { tenantId, branchId, date: { $gte: today }, status: 'finished' } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$total" },
                    orderCount: { $sum: 1 },
                    avgTicket: { $avg: "$total" }
                }
            }
        ]);

        const recentOrders = await Sale.find({ tenantId, branchId, date: { $gte: today } })
            .sort({ date: -1 })
            .limit(10);

        const currentShift = await Shift.findOne({
            tenantId,
            branchId,
            cashierId: req.userId,
            status: 'open'
        });

        res.json({
            stats: stats[0] || { totalRevenue: 0, orderCount: 0, avgTicket: 0 },
            recentOrders,
            currentShift: currentShift || null
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Sales History (Paginated)
router.get('/reports/history', async (req, res) => {
    try {
        const { branchId, tenantId } = req;
        const { page = 1, limit = 50, from, to, cashier, status } = req.query;

        const filter = { tenantId, branchId };

        if (from || to) {
            filter.date = {};
            if (from) {
                const f = !isNaN(from) ? parseInt(from) : from;
                filter.date.$gte = new Date(f);
            }
            if (to) {
                const t = !isNaN(to) ? parseInt(to) : to;
                const toDate = new Date(t);
                toDate.setHours(23, 59, 59, 999);
                filter.date.$lte = toDate;
            }
        }

        if (cashier) filter.cashierId = cashier;
        if (status) filter.status = status;

        const total = await Sale.countDocuments(filter);

        const summary = await Sale.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalCash: { $sum: { $cond: [{ $eq: ["$method", "cash"] }, "$total", 0] } },
                    totalCard: { $sum: { $cond: [{ $eq: ["$method", "card"] }, "$total", 0] } },
                    totalMobile: { $sum: { $cond: [{ $eq: ["$method", "mobile"] }, "$total", 0] } },
                    totalDiscount: { $sum: { $ifNull: ["$discount", 0] } }
                }
            }
        ]);

        const sales = await Sale.find(filter)
            .sort({ date: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            summary: summary[0] || { totalCash: 0, totalCard: 0, totalMobile: 0, totalDiscount: 0 },
            sales
        });

    } catch (err) {
        console.error('History Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});
// === INVENTORY MANAGEMENT ===

const InventoryAdjustment = require('../models/InventoryAdjustment');

// 1. Adjust Inventory (Waste, Damage, Audit, Transfer)
router.post('/inventory/adjust', async (req, res) => {
    try {
        const { itemId, type, qty, unitCost, reason } = req.body;
        // req.user, req.tenantId, req.branchId are set by auth/branchScope middleware
        // verify req.userId is available -> auth middleware sets req.userId

        if (!itemId || !type || qty === undefined || unitCost === undefined) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const adjustmentQty = parseFloat(qty);
        const adjustmentUnitCost = parseFloat(unitCost);
        const totalCost = adjustmentQty * adjustmentUnitCost;

        // 1. Create Adjustment Record
        const adjustment = new InventoryAdjustment({
            tenantId: req.tenantId,
            branchId: req.branchId,
            itemId: String(itemId),
            type,
            qty: adjustmentQty,
            unitCost: adjustmentUnitCost,
            totalCost,
            reason,
            createdBy: req.userId
        });
        await adjustment.save();

        // 2. Update Stock
        await ProductStock.findOneAndUpdate(
            { tenantId: req.tenantId, branchId: req.branchId, productId: String(itemId) },
            { $inc: { qty: adjustmentQty } },
            { upsert: true, new: true }
        );

        // 3. Audit Log
        await AuditLog.create({
            tenantId: req.tenantId,
            branchId: req.branchId,
            userId: req.userId,
            action: 'INVENTORY_ADJUST',
            details: { itemId, type, qty: adjustmentQty, reason },
            ipAddress: req.ip
        });

        res.json({ success: true, id: adjustment._id });

    } catch (err) {
        console.error('Inventory Adjustment Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Transfer Inventory (Branch to Branch)
router.post('/inventory/transfer', async (req, res) => {
    try {
        const { itemId, targetBranchId, qty } = req.body;
        // req.tenantId, req.branchId (source) from middleware

        if (!itemId || !targetBranchId || !qty || qty <= 0) {
            return res.status(400).json({ error: "Invalid transfer parameters" });
        }

        if (String(req.branchId) === String(targetBranchId)) {
            return res.status(400).json({ error: "Cannot transfer to same branch" });
        }

        const transferQty = parseFloat(qty);

        // 1. Check Source Stock
        const sourceStock = await ProductStock.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            productId: String(itemId)
        });

        if (!sourceStock || sourceStock.qty < transferQty) {
            return res.status(400).json({ error: "Insufficient stock for transfer" });
        }

        // 2. Get Product Cost (from source) - In real app, might query Product definition
        // For now, we use a weighted average if available, or 0. 
        // We'll trust the frontend to send unitCost for now, OR fetch from DB. 
        // Better: Fetch from DB. But DB structure for "Product" cost is in local `ingredients` or `spare_parts` JSON. 
        // We can't easily access that here without reading the big JSON blob.
        // Let's accept unitCost from frontend for simplicity in this phase, validated by user permission.
        const unitCost = req.body.unitCost || 0;
        const totalCost = transferQty * unitCost;

        const referenceId = `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 3. Create TRANSFER_OUT Record (Source)
        const outAdj = new InventoryAdjustment({
            tenantId: req.tenantId,
            branchId: req.branchId,
            itemId: String(itemId),
            type: 'TRANSFER_OUT',
            qty: -transferQty, // OUT is negative
            unitCost,
            totalCost,
            reason: `Transfer to Branch ${targetBranchId}`,
            referenceId,
            createdBy: req.userId
        });
        await outAdj.save();

        // 4. Create TRANSFER_IN Record (Target)
        const inAdj = new InventoryAdjustment({
            tenantId: req.tenantId,
            branchId: targetBranchId,
            itemId: String(itemId),
            type: 'TRANSFER_IN',
            qty: transferQty, // IN is positive
            unitCost,
            totalCost,
            reason: `Transfer from Branch ${req.branchId}`,
            referenceId,
            createdBy: req.userId
        });
        await inAdj.save();

        // 5. Update Stocks (Atomic-ish)
        // Source: Decrement
        await ProductStock.findOneAndUpdate(
            { tenantId: req.tenantId, branchId: req.branchId, productId: String(itemId) },
            { $inc: { qty: -transferQty } }
        );

        // Target: Increment
        await ProductStock.findOneAndUpdate(
            { tenantId: req.tenantId, branchId: targetBranchId, productId: String(itemId) },
            { $inc: { qty: transferQty } },
            { upsert: true, new: true }
        );

        // 6. Audit Log
        await AuditLog.create({
            tenantId: req.tenantId,
            branchId: req.branchId,
            userId: req.userId,
            action: 'INVENTORY_TRANSFER',
            details: { itemId, targetBranchId, qty: transferQty, referenceId },
            ipAddress: req.ip
        });

        res.json({ success: true, referenceId });

    } catch (err) {
        console.error('Transfer Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
