/**
 * Kitchen Orders Router (Dine-In)
 *
 * Item-level kitchen display for dine-in orders.
 * Separate from /kitchen/orders (Sale-level status).
 * Staff JWT required.
 *
 * Performance note:
 *   Full list: GET /api/dine-in/kitchen
 *   Delta:      GET /api/dine-in/kitchen?since=<ISO-timestamp>  ← returns only orders updated since
 */

const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

// ─── Structured log helper (mirrors orders.js format) ───
function log(event, ctx = {}) {
    const parts = Object.entries(ctx).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`[DINE_IN] ${event} ${parts}`);
}

// ═══════════════════════════════════════════════════════════
// GET /api/dine-in/kitchen[?since=<ISO>]
// Returns active (sent/preparing) items grouped by order/table.
// ?since=<ISO-timestamp>  — delta mode: only orders updated after that time.
//   Useful at 100+ tables to avoid sending unchanged data on every poll.
// Uses the hasActiveKitchenItems index for performance.
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
    try {
        const query = {
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open',
            hasActiveKitchenItems: true   // Compound index — fast
        };

        // Delta mode: only return orders touched since the given timestamp
        if (req.query.since) {
            const since = new Date(req.query.since);
            if (!isNaN(since.getTime())) {
                query.lastActivityAt = { $gt: since };
            }
        }

        const orders = await Order.find(query)
            .select('tableId tableName items currentBatch requestedBillAt lastActivityAt')
            .sort({ openedAt: 1 })           // Oldest first (FIFO)
            .lean();

        // Flatten to kitchen-relevant structure
        const kitchenView = orders.map(order => ({
            orderId: order._id,
            tableId: order.tableId,
            tableName: order.tableName,
            requestedBillAt: order.requestedBillAt,
            lastActivityAt: order.lastActivityAt,   // Returned so client can use as next `since`
            batches: groupByBatch(order.items.filter(i =>
                ['sent', 'preparing'].includes(i.kitchenStatus)
            ))
        }));

        res.json(kitchenView);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Helper: group items by batch number ───
function groupByBatch(items) {
    const batches = {};
    for (const item of items) {
        const bn = item.batchNo || 0;
        if (!batches[bn]) batches[bn] = [];
        batches[bn].push(item);
    }
    return Object.entries(batches).map(([batchNo, batchItems]) => ({
        batchNo: parseInt(batchNo),
        items: batchItems
    }));
}

// ═══════════════════════════════════════════════════════════
// PATCH /api/dine-in/kitchen/:orderId/items/:lineId/status
// Kitchen updates item to 'preparing' or 'ready'
// ═══════════════════════════════════════════════════════════
router.patch('/:orderId/items/:lineId/status', async (req, res) => {
    try {
        const { status } = req.body;

        if (!['preparing', 'ready'].includes(status)) {
            return res.status(400).json({ error: `Invalid status. Kitchen can only set 'preparing' or 'ready'.` });
        }

        const order = await Order.findOne({
            _id: req.params.orderId,
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open'
        });
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const item = order.items.find(i => i.lineId === req.params.lineId);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        // Validate transition
        if (status === 'preparing' && item.kitchenStatus !== 'sent') {
            return res.status(400).json({ error: `Item must be 'sent' before marking as 'preparing'. Current: ${item.kitchenStatus}` });
        }
        if (status === 'ready' && !['preparing', 'sent'].includes(item.kitchenStatus)) {
            return res.status(400).json({ error: `Item cannot be marked 'ready' from status: ${item.kitchenStatus}` });
        }

        // Apply status + timestamp
        item.kitchenStatus = status;
        if (status === 'preparing') item.preparingAt = new Date();
        if (status === 'ready') item.readyAt = new Date();

        // Recompute the kitchen flag (must call before save)
        order.recomputeKitchenFlag();

        await order.save();

        log('ITEM_STATUS', {
            branch: order.branchId,
            table: order.tableName,
            orderId: order._id,
            lineId: req.params.lineId,
            status
        });

        // Determine if all items are now done — useful for the waiter notification
        const allDone = order.items.every(i => ['ready', 'cancelled'].includes(i.kitchenStatus));

        res.json({
            success: true,
            lineId: req.params.lineId,
            newStatus: status,
            allItemsReady: allDone
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
