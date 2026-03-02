/**
 * Orders Router
 *
 * Full lifecycle management for live dine-in open orders.
 * Auth: qrAuth middleware (accepts both staff JWT and customer QR token).
 * All DB writes use optimistic locking via `version` field.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Sale = require('../models/Sale');
const ProductStock = require('../models/ProductStock');
const AuditLog = require('../models/AuditLog');
const storage = require('../utils/storage');

// ─── Structured logger ───────────────────────────────────────
// Emits consistent, grep-friendly lines: [DINE_IN] EVENT key=value ...
function log(event, ctx = {}) {
    const parts = Object.entries(ctx).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`[DINE_IN] ${event} ${parts}`);
}

// ─── Helper: safe crypto.randomUUID fallback ───
function genLineId() {
    try { return require('crypto').randomUUID(); }
    catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
}

// ─── Helper: deduct stock (reuses same pattern as api.js) ───
async function deductStock(tenantId, branchId, productId, qty, session) {
    try {
        await ProductStock.findOneAndUpdate(
            { tenantId, branchId, productId: String(productId) },
            { $inc: { qty: -qty } },
            { upsert: true, session }
        );
    } catch (e) {
        console.error(`Stock deduction failed for ${productId}:`, e.message);
        throw e; // Re-throw so transaction aborts
    }
}

// ─── Helper: enrich item costs from master product list ───
async function enrichCosts(items, tenantId) {
    try {
        const raw = await storage.readData('spare_parts', tenantId);
        const products = JSON.parse(raw || '[]');
        const costMap = {};
        products.forEach(p => costMap[String(p.id)] = p.cost || 0);
        return items.map(item => ({ ...item, cost: costMap[String(item.id)] || 0 }));
    } catch (e) {
        return items; // Non-critical — cost defaults to 0
    }
}

// ═══════════════════════════════════════════════════════════
// GET /api/orders — List all open orders (waiter/cashier view)
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
    try {
        if (req.userRole === 'customer') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const orders = await Order.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open'
        }).sort({ openedAt: 1 }).lean();

        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /api/orders/table/:tableId — Get active order for a table
// ═══════════════════════════════════════════════════════════
router.get('/table/:tableId', async (req, res) => {
    try {
        const order = await Order.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            tableId: req.params.tableId,
            status: 'open'
        }).lean();

        if (!order) return res.json(null);
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /api/orders/:id — Get single order
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            branchId: req.branchId
        }).lean();

        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders — Create a new open order for a table
// ═══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
    try {
        const { tableId, items = [], note = '' } = req.body;
        if (!tableId) return res.status(400).json({ error: 'tableId is required' });

        // Verify table belongs to this branch
        const table = await Table.findOne({
            _id: tableId,
            tenantId: req.tenantId,
            branchId: req.branchId,
            isActive: true
        });
        if (!table) return res.status(404).json({ error: 'Table not found' });

        // Block if table already has an active order
        if (table.activeOrderId) {
            const existing = await Order.findOne({ _id: table.activeOrderId, status: 'open' });
            if (existing) {
                return res.status(409).json({ error: 'Table already has an active order.', orderId: existing._id });
            }
        }

        // Enrich item costs
        const enrichedItems = await enrichCosts(
            items.map(i => ({ ...i, lineId: i.lineId || genLineId(), addedBy: req.userRole === 'customer' ? 'customer' : (req.userId || 'waiter') })),
            req.tenantId
        );

        const order = new Order({
            tenantId: req.tenantId,
            branchId: req.branchId,
            tableId,
            tableName: table.name,
            items: enrichedItems,
            note,
            openedBy: req.userRole === 'customer' ? 'customer' : (req.userId || 'waiter')
        });

        await order.save();

        // Mark table as occupied
        table.status = 'occupied';
        table.activeOrderId = order._id;
        await table.save();

        log('ORDER_CREATED', { branch: req.branchId, table: table.name, orderId: order._id, openedBy: order.openedBy });

        res.status(201).json({ success: true, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// PATCH /api/orders/:id/items — Add or update items
// Requires version match for optimistic locking
// ═══════════════════════════════════════════════════════════
router.patch('/:id/items', async (req, res) => {
    try {
        const { version, items } = req.body;
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'items array is required' });
        }

        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open'
        });
        if (!order) return res.status(404).json({ error: 'Order not found or already closed' });

        // Reject edits while cashier is processing payment
        if (order.isLocked) {
            return res.status(423).json({ error: 'The bill is being processed. Please wait or ask your waiter.' });
        }

        // Optimistic locking check
        if (version !== undefined && order.version !== version) {
            return res.status(409).json({
                error: 'Order was updated by someone else. Please refresh and try again.',
                currentVersion: order.version
            });
        }

        // Enrich with costs and add/update items
        const newItems = await enrichCosts(
            items.map(i => ({
                ...i,
                lineId: i.lineId || genLineId(),
                addedBy: i.addedBy || (req.userRole === 'customer' ? 'customer' : (req.userId || 'waiter'))
            })),
            req.tenantId
        );

        // Merge: update existing by lineId, or push new
        for (const newItem of newItems) {
            const existingIdx = order.items.findIndex(i => i.lineId === newItem.lineId);
            if (existingIdx !== -1) {
                // Only pending items can be edited
                if (order.items[existingIdx].kitchenStatus !== 'pending') {
                    return res.status(409).json({
                        error: `Item "${order.items[existingIdx].name}" cannot be edited — it has already been sent to the kitchen.`
                    });
                }
                Object.assign(order.items[existingIdx], newItem);
            } else {
                order.items.push(newItem);
            }
        }

        order.version += 1;
        order.lastActivityAt = new Date();
        order.recomputeKitchenFlag();

        await order.save();
        res.json({ success: true, version: order.version, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/orders/:id/items/:lineId — Remove a single item
// Only allowed if kitchenStatus = pending
// Waiters can also cancel 'sent' items
// ═══════════════════════════════════════════════════════════
router.delete('/:id/items/:lineId', async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open'
        });
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (order.isLocked) {
            return res.status(423).json({ error: 'The bill is being processed. Please wait or ask your waiter.' });
        }

        const item = order.items.find(i => i.lineId === req.params.lineId);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const isStaff = req.userRole === 'staff';

        // Edit rules:
        // pending → anyone can delete
        // sent → waiter only can cancel
        // preparing/ready → locked for everyone
        if (item.kitchenStatus === 'preparing' || item.kitchenStatus === 'ready') {
            return res.status(409).json({
                error: `This item is already being prepared. Ask your waiter for help.`,
                kitchenStatus: item.kitchenStatus
            });
        }
        if (item.kitchenStatus === 'sent' && !isStaff) {
            return res.status(403).json({
                error: 'This item has been sent to the kitchen. Ask your waiter to cancel it.'
            });
        }

        // Mark as cancelled (don't splice — keep for audit trail in kitchen)
        item.kitchenStatus = 'cancelled';
        item.cancelledAt = new Date();

        order.version += 1;
        order.lastActivityAt = new Date();
        order.recomputeKitchenFlag();

        await order.save();
        res.json({ success: true, version: order.version });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/send — Send all pending items to kitchen
// Increments batch counter; only pending items are affected
// ═══════════════════════════════════════════════════════════
router.post('/:id/send', async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open'
        });
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (order.isLocked) {
            return res.status(423).json({ error: 'The bill is being processed. Please wait or ask your waiter.' });
        }

        const pendingItems = order.items.filter(i => i.kitchenStatus === 'pending');
        if (pendingItems.length === 0) {
            return res.status(400).json({ error: 'No pending items to send to the kitchen.' });
        }

        order.currentBatch += 1;
        const batchNo = order.currentBatch;
        const now = new Date();

        pendingItems.forEach(item => {
            item.kitchenStatus = 'sent';
            item.sentAt = now;
            item.batchNo = batchNo;
        });

        order.version += 1;
        order.lastActivityAt = now;
        order.recomputeKitchenFlag();

        await order.save();

        log('ITEMS_SENT', { branch: order.branchId, table: order.tableName, orderId: order._id, batch: batchNo, count: pendingItems.length });

        res.json({ success: true, batchNo, sentCount: pendingItems.length, version: order.version });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/lock — Lock order (cashier starts payment)
// ═══════════════════════════════════════════════════════════
router.post('/:id/lock', async (req, res) => {
    try {
        if (req.userRole === 'customer') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open'
        });
        if (!order) return res.status(404).json({ error: 'Order not found' });

        order.isLocked = true;
        order.requestedBillAt = order.requestedBillAt || new Date();
        await order.save();

        log('BILL_LOCKED', { branch: order.branchId, table: order.tableName, orderId: order._id, by: req.userId || 'staff' });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/unlock — Unlock order (cashier cancels payment)
// ═══════════════════════════════════════════════════════════
router.post('/:id/unlock', async (req, res) => {
    try {
        if (req.userRole === 'customer') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const order = await Order.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId, branchId: req.branchId },
            { isLocked: false },
            { new: true }
        );
        if (!order) return res.status(404).json({ error: 'Order not found' });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/close — Convert order → Sale (atomic transaction)
// ═══════════════════════════════════════════════════════════
router.post('/:id/close', async (req, res) => {
    if (req.userRole === 'customer') {
        return res.status(403).json({ error: 'Not authorized' });
    }

    const { method = 'cash', discount = 0, discountType = 'none', closeOverride = false } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // ── Idempotency guard: if already closed return success immediately (handles retries / double-click) ──
        const existingOrder = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            branchId: req.branchId
        }).select('status mappedSaleId').lean();

        if (existingOrder?.status === 'closed') {
            log('CLOSE_IDEMPOTENT', { orderId: req.params.id, saleId: existingOrder.mappedSaleId });
            return res.json({ success: true, alreadyClosed: true, saleId: existingOrder.mappedSaleId });
        }

        // 1. Atomic lock — prevents double-close
        const order = await Order.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId, branchId: req.branchId, status: 'open', isLocked: false },
            { isLocked: true },
            { new: true, session }
        );
        if (!order) {
            await session.abortTransaction();
            session.endSession();
            return res.status(409).json({ error: 'Order not found, already closed, or currently being processed.' });
        }

        // 2. Validate all items are ready/cancelled (or force override)
        const activeItems = order.items.filter(i => !['ready', 'cancelled'].includes(i.kitchenStatus));
        if (activeItems.length > 0 && !closeOverride) {
            await session.abortTransaction();
            session.endSession();
            await Order.updateOne({ _id: order._id }, { isLocked: false });
            return res.status(409).json({
                error: `${activeItems.length} item(s) are not ready yet.`,
                canOverride: true,
                activeStatuses: [...new Set(activeItems.map(i => i.kitchenStatus))]
            });
        }

        // 3. Compute totals
        const billItems = order.items.filter(i => i.kitchenStatus !== 'cancelled');
        const subtotal = billItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
        let discountAmt = 0;
        if (discountType === 'percent') discountAmt = subtotal * (discount / 100);
        else if (discountType === 'value') discountAmt = discount;
        const total = Math.max(0, subtotal - discountAmt);

        // 4. Generate sale ID
        const lastSale = await Sale.findOne({ tenantId: order.tenantId, branchId: order.branchId })
            .sort({ date: -1 }).select('id').lean();
        const lastNum = lastSale ? parseInt((lastSale.id || '').replace(/\D/g, '')) || 0 : 0;
        const saleId = `REC-${lastNum + 1}`;
        const receiptNo = String(lastNum + 1).padStart(4, '0');

        // 5. Create Sale (inside transaction)
        const newSale = new Sale({
            id: saleId,
            receiptNo,
            tenantId: order.tenantId,
            branchId: order.branchId,
            cashier: req.userId || 'cashier',
            orderType: 'dine_in',
            tableId: order.tableId.toString(),
            tableName: order.tableName,
            items: billItems.map(i => ({
                id: i.id,
                code: i.code,
                name: i.name,
                qty: i.qty,
                price: i.price,
                cost: i.cost,
                note: i.note,
                discount: { type: 'none', value: 0 }
            })),
            subtotal,
            discount: discountAmt,
            total,
            method,
            status: 'finished',
            source: 'pos',
            date: new Date()
        });

        await newSale.save({ session });

        // 6. Deduct stock (inside transaction)
        for (const item of billItems) {
            if (item.id) {
                await deductStock(order.tenantId, order.branchId, item.id, item.qty, session);
            }
        }

        // 7. Close order + free table (inside transaction)
        await Order.updateOne(
            { _id: order._id },
            { status: 'closed', closedAt: new Date(), mappedSaleId: saleId, isLocked: true },
            { session }
        );

        await Table.updateOne(
            { _id: order.tableId },
            { status: 'available', activeOrderId: null },
            { session }
        );

        // 8. Commit everything
        await session.commitTransaction();
        session.endSession();

        // 9. Non-critical post-commit (outside transaction)
        try {
            AuditLog.create({
                tenantId: order.tenantId,
                branchId: order.branchId,
                userId: req.userId,
                action: 'DINE_IN_CLOSE',
                details: { orderId: order._id, saleId, total, tableId: order.tableId, override: closeOverride },
                ipAddress: req.ip
            });
        } catch (e) { /* non-fatal */ }

        log('ORDER_CLOSED', {
            branch: order.branchId,
            table: order.tableName,
            orderId: order._id,
            receipt: receiptNo,
            total: total.toFixed(2),
            method,
            override: closeOverride
        });

        res.json({ success: true, saleId, receiptNo, total });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        // Release lock if it was set before the error
        try { await Order.updateOne({ _id: req.params.id }, { isLocked: false }); } catch (e) { /* ignore */ }
        console.error('[DINE_IN] ORDER_CLOSE_ERROR orderId=' + req.params.id, err.message);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/cancel — Cancel an open order (staff only)
// ═══════════════════════════════════════════════════════════
router.post('/:id/cancel', async (req, res) => {
    try {
        if (req.userRole === 'customer') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open'
        });
        if (!order) return res.status(404).json({ error: 'Order not found' });

        order.status = 'cancelled';
        order.closedAt = new Date();
        await order.save();

        // Free the table
        await Table.updateOne(
            { _id: order.tableId },
            { status: 'available', activeOrderId: null }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
