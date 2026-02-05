const express = require('express');
const router = express.Router();
const storage = require('../utils/storage');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

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
                    // Legacy items might not have branchId - perform migration check?
                    // Or just default to showing them?
                    // Safer to only show matching branchId, OR if user is Main Branch (and item has no branch)?
                    // For now: Strict matching.
                    return item.branchId === req.branchId; // || !item.branchId (if we want to see legacy)
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
                const stocks = await ProductStock.find({
                    tenantId: req.tenantId,
                    branchId: req.branchId
                });

                // Create Map for speed
                const stockMap = {};
                stocks.forEach(s => stockMap[s.productId.toString()] = s.qty);

                // Merge
                products.forEach(p => {
                    if (stockMap[p.id]) {
                        p.stock = stockMap[p.id];
                    } else {
                        // If no stock entry exists, it implies 0 or undefined?
                        // If migrating, maybe keep original? 
                        // But strictly speaking, it should be 0.
                        // Let's default to 0 to be safe for multi-branch isolation.
                        p.stock = 0;
                    }
                });
                return res.json(products);

            } catch (e) {
                console.error('Stock Merge Error', e);
                // Fallback to original data if error
                return res.json(products);
            }
        }

        res.send(rawData || '');
    } catch (err) {
        console.error(`Error reading ${key}:`, err);
        res.status(500).send('');
    }
});

// List Data Files (Replace `listDataFiles` command)
router.get('/data/list', async (req, res) => {
    try {
        const files = await storage.listDataFiles();
        // Filtering list by tenantId prefix
        const tenantPrefix = req.tenantId ? `${req.tenantId}_` : '';
        const filtered = files
            .filter(f => f.startsWith(tenantPrefix))
            .map(f => f.replace(tenantPrefix, ''));
        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check File Exists (Replace `checkFileExists` command)
router.post('/file/exists', async (req, res) => {
    const { folderPath, filename } = req.body;
    const exists = await storage.checkFileExists(filename, req.tenantId);
    res.json(exists);
});

// === Machine ID Endpoint (REMOVED: Managed by Super Admin) ===

// === Sales & Inventory ===
const ProductStock = require('../models/ProductStock');
const Shift = require('../models/Shift');

// === SHIFT MANAGEMENT ===

// 1. Get Current Shift
router.get('/shifts/current', async (req, res) => {
    try {
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

        // Check for existing open shift
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

        // Aggregate Sales for this Shift (SNAPSHOT at this exact moment)
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

        // Voids Count
        const voids = await Sale.countDocuments({ shiftId: shift._id, status: 'void' });
        const voidsValue = await Sale.aggregate([
            { $match: { shiftId: shift._id, status: 'void' } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);

        shift.closedAt = new Date();
        shift.status = 'closed';
        shift.closingCash = parseFloat(closingCash || 0);

        // 🚀 SNAPSHOT: Calculate Expected Cash and lock it
        shift.expectedCash = shift.openingCash + stats.cashTotal;
        shift.difference = shift.closingCash - shift.expectedCash;

        // Audit Info
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

const Sale = require('../models/Sale');

router.post('/sales', async (req, res) => {
    try {
        const saleData = req.body;
        if (!saleData || !saleData.items) return res.status(400).json({ error: 'Invalid Sale Data' });

        // 1. Enforce Branch Context
        saleData.branchId = req.branchId;
        saleData.tenantId = req.tenantId;

        // 🚀 ENHANCEMENT: Enforce Active Shift
        const activeShift = await Shift.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            cashierId: req.userId,
            status: 'open'
        });
        if (!activeShift) return res.status(403).json({ error: 'No open shift found. Please open a shift first.' });
        saleData.shiftId = activeShift._id;

        // 🚀 ENHANCEMENT: Cost Snapshots (Fetch latest costs from master data)
        try {
            const masterDataRaw = await storage.readData('spare_parts', req.tenantId);
            const masterProducts = JSON.parse(masterDataRaw || '[]');
            const costMap = {};
            masterProducts.forEach(p => costMap[String(p.id)] = p.cost || 0);

            saleData.items.forEach(item => {
                item.cost = costMap[String(item.id)] || 0; // Snapshot cost
            });
        } catch (e) { console.error('Cost Snapshot Error:', e); }

        // 2. Persist Sale (Mongoose Collection - Primary)
        const newSale = new Sale(saleData);
        await newSale.save();

        // 3. Dual-Write to Legacy Storage (Optional / Background)
        // This ensures the old reporting views still work while we migrate
        storage.insert('sales', saleData).catch(e => console.error('Legacy Save Error:', e));

        // 4. Update DailySummary (Real-time Aggregation with Timezone support)
        try {
            const Branch = require('../models/Branch');
            const branch = await Branch.findById(req.branchId);
            const timezone = branch?.settings?.timezone || 'Africa/Cairo';

            // Get Date String in Branch Local Time
            const branchDateStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD

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

            // Payment Method specific increment (Skip for voids)
            if (!isVoid && !isRefund) {
                const methodKey = `${(newSale.method || 'cash').toLowerCase()}Total`;
                if (['cashTotal', 'cardTotal', 'mobileTotal'].includes(methodKey)) {
                    update.$inc[methodKey] = newSale.total;
                }
            }

            const DailySummary = require('../models/DailySummary');
            await DailySummary.findOneAndUpdate(
                { tenantId: req.tenantId, branchId: req.branchId, date: branchDateStr },
                update,
                { upsert: true, new: true }
            );
        } catch (e) { console.error('Summary Update Error:', e); }

        // 5. Process Stock Deduction (Async Side Effect)
        for (const item of saleData.items) {
            // Direct Deduction
            await deductStock(req.tenantId, req.branchId, item.id, item.qty);

            // Add-ons Deduction
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

        // 1. Branch Global Stats (Today)
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

        // 2. Recent Orders (Global)
        const recentOrders = await Sale.find({ tenantId, branchId, date: { $gte: today } })
            .sort({ date: -1 })
            .limit(10);

        // 3. Current User Shift Stats (NEW)
        const currentShift = await Shift.findOne({
            tenantId,
            branchId,
            cashierId: userId,
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

        if (cashier) filter.cashier = cashier;
        if (status) filter.status = status;

        const total = await Sale.countDocuments(filter);

        // 🚀 ENHANCEMENT: Aggregate Summary for this Filter
        const summary = await Sale.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalCash: { $sum: { $cond: [{ $eq: ["$paymentMethod", "cash"] }, "$total", 0] } },
                    totalCard: { $sum: { $cond: [{ $in: ["$paymentMethod", ["card", "visa"]] }, "$total", 0] } },
                    totalMobile: { $sum: { $cond: [{ $eq: ["$paymentMethod", "mobile"] }, "$total", 0] } },
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
