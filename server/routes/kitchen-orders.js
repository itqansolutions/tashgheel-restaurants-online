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

const prisma = require('../prisma');

// ─── Structured log helper (mirrors orders.js format) ───
function log(event, ctx = {}) {
    const parts = Object.entries(ctx).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`[DINE_IN] ${event} ${parts}`);
}

// @route  GET /api/dine-in/kitchen[?since=<ISO>]
router.get('/', async (req, res) => {
    try {
        const filter = {
            tenantId: req.tenantId,
            branchId: req.branchId,
            status: 'open',
            items: {
                some: {
                    kitchenStatus: { in: ['sent', 'preparing'] }
                }
            }
        };

        if (req.query.since) {
            const since = new Date(req.query.since);
            if (!isNaN(since.getTime())) {
                filter.lastActivityAt = { gt: since };
            }
        }

        const orders = await prisma.order.findMany({
            where: filter,
            include: { items: true },
            orderBy: { openedAt: 'asc' }
        });

        // Flatten to kitchen-relevant structure
        const kitchenView = orders.map(order => ({
            orderId: order.id,
            tableId: order.tableId,
            tableName: order.tableName,
            requestedBillAt: order.requestedBillAt,
            lastActivityAt: order.lastActivityAt,
            batches: groupByBatch(order.items.filter(i =>
                ['sent', 'preparing'].includes(i.kitchenStatus)
            ))
        }));

        res.json(kitchenView);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

// @route  PATCH /api/dine-in/kitchen/:orderId/items/:lineId/status
router.patch('/:orderId/items/:lineId/status', async (req, res) => {
    try {
        const { status } = req.body;

        if (!['preparing', 'ready'].includes(status)) {
            return res.status(400).json({ error: `Invalid status. Kitchen can only set 'preparing' or 'ready'.` });
        }

        const order = await prisma.order.findUnique({
            where: { id: req.params.orderId },
            include: { items: true }
        });

        if (!order || order.tenantId !== req.tenantId || order.status !== 'open') {
            return res.status(404).json({ error: 'Order not found' });
        }

        const item = order.items.find(i => i.lineId === req.params.lineId);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        // Validate transition
        if (status === 'preparing' && item.kitchenStatus !== 'sent') {
            return res.status(400).json({ error: `Item must be 'sent' before marking as 'preparing'. Current: ${item.kitchenStatus}` });
        }
        if (status === 'ready' && !['preparing', 'sent'].includes(item.kitchenStatus)) {
            return res.status(400).json({ error: `Item cannot be marked 'ready' from status: ${item.kitchenStatus}` });
        }

        await prisma.$transaction([
            prisma.orderItem.update({
                where: { id: item.id },
                data: {
                    kitchenStatus: status,
                    preparingAt: status === 'preparing' ? new Date() : undefined,
                    readyAt: status === 'ready' ? new Date() : undefined
                }
            }),
            prisma.order.update({
                where: { id: order.id },
                data: { lastActivityAt: new Date(), version: { increment: 1 } }
            })
        ]);

        log('ITEM_STATUS', {
            branch: order.branchId,
            table: order.tableName,
            orderId: order.id,
            lineId: req.params.lineId,
            status
        });

        const updatedOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: { items: true }
        });
        const allDone = updatedOrder.items.every(i => ['ready', 'cancelled'].includes(i.kitchenStatus));

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
