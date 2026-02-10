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

        storage.insert('sales', saleData).catch(e => console.error('Legacy Save Error:', e));

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

        for (const item of saleData.items) {
            await deductStock(req.tenantId, req.branchId, item.id, item.qty);
            if (item.addons && item.addons.length > 0) {
                for (const addon of item.addons) {
                    await deductStock(req.tenantId, req.branchId, addon.id, item.qty);
                }
            }
        }

        res.json({ success: true, id: newSale.id });

    } catch (err) {
        console.error('Sale Error:', err);
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
            if (from) filter.date.$gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
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

module.exports = router;
