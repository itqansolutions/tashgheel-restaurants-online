/**
 * Orders Router
 *
 * Full lifecycle management for live dine-in open orders.
 * Auth: qrAuth middleware (accepts both staff JWT and customer QR token).
 * All DB writes use optimistic locking via `version` field.
 */

const prisma = require('../prisma');

// ─── Structured logger ───────────────────────────────────────
function log(event, ctx = {}) {
    const parts = Object.entries(ctx).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`[DINE_IN] ${event} ${parts}`);
}

// ─── Helper: safe crypto.randomUUID fallback ───
function genLineId() {
    try { return require('crypto').randomUUID(); }
    catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
}

// ─── Helper: enrich item costs from master product list ───
async function enrichCosts(items, tenantId) {
    try {
        const dataDoc = await prisma.data.findUnique({
            where: { key_tenantId: { key: 'spare_parts', tenantId } }
        });
        const products = dataDoc ? (Array.isArray(dataDoc.value) ? dataDoc.value : []) : [];
        const costMap = {};
        products.forEach(p => costMap[String(p.id)] = p.cost || 0);
        return items.map(item => ({ ...item, cost: costMap[String(item.id)] || 0 }));
    } catch (e) {
        return items; 
    }
}

// @route  GET /api/orders
router.get('/', async (req, res) => {
    try {
        if (req.userRole === 'customer') return res.status(403).json({ error: 'Not authorized' });
        const orders = await prisma.order.findMany({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                status: 'open'
            },
            include: { items: true },
            orderBy: { openedAt: 'asc' }
        });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  GET /api/orders/table/:tableId
router.get('/table/:tableId', async (req, res) => {
    try {
        const order = await prisma.order.findFirst({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                tableId: req.params.tableId,
                status: 'open'
            },
            include: { items: true }
        });

        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  GET /api/orders/:id
router.get('/:id', async (req, res) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { items: true }
        });

        if (!order || order.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  POST /api/orders
router.post('/', async (req, res) => {
    try {
        const { tableId, items = [], note = '' } = req.body;
        if (!tableId) return res.status(400).json({ error: 'tableId is required' });

        const table = await prisma.table.findUnique({
            where: { id: tableId }
        });
        if (!table || table.tenantId !== req.tenantId) return res.status(404).json({ error: 'Table not found' });

        if (table.activeOrderId) {
            const existing = await prisma.order.findUnique({ where: { id: table.activeOrderId } });
            if (existing && existing.status === 'open') {
                return res.status(409).json({ error: 'Table already has an active order.', orderId: existing.id });
            }
        }

        const enrichedItems = await enrichCosts(
            items.map(i => ({ ...i, lineId: i.lineId || genLineId(), addedBy: req.userRole === 'customer' ? 'customer' : (req.userId || 'waiter') })),
            req.tenantId
        );

        const order = await prisma.$transaction(async (tx) => {
            const newOrder = await tx.order.create({
                data: {
                    tenantId: req.tenantId,
                    branchId: req.branchId,
                    tableId,
                    tableName: table.name,
                    note,
                    openedBy: req.userRole === 'customer' ? 'customer' : (req.userId || 'waiter'),
                    items: {
                        create: enrichedItems.map(i => ({
                            productId: String(i.id),
                            productCode: i.code,
                            name: i.name,
                            qty: i.qty,
                            price: i.price,
                            cost: i.cost,
                            note: i.note,
                            addedBy: i.addedBy,
                            lineId: i.lineId
                        }))
                    }
                },
                include: { items: true }
            });

            await tx.table.update({
                where: { id: tableId },
                data: { status: 'occupied', activeOrderId: newOrder.id }
            });

            return newOrder;
        });

        log('ORDER_CREATED', { branch: req.branchId, table: table.name, orderId: order.id, openedBy: order.openedBy });
        res.status(201).json({ success: true, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  PATCH /api/orders/:id/items
router.patch('/:id/items', async (req, res) => {
    try {
        const { version, items } = req.body;
        if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items array is required' });

        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { items: true }
        });

        if (!order || order.status !== 'open' || order.tenantId !== req.tenantId) {
            return res.status(404).json({ error: 'Order not found or already closed' });
        }

        if (order.isLocked) return res.status(423).json({ error: 'The bill is being processed. Please wait or ask your waiter.' });

        if (version !== undefined && order.version !== version) {
            return res.status(409).json({
                error: 'Order was updated by someone else. Please refresh and try again.',
                currentVersion: order.version
            });
        }

        const newItemsEnriched = await enrichCosts(
            items.map(i => ({
                ...i,
                lineId: i.lineId || genLineId(),
                addedBy: i.addedBy || (req.userRole === 'customer' ? 'customer' : (req.userId || 'waiter'))
            })),
            req.tenantId
        );

        await prisma.$transaction(async (tx) => {
            for (const item of newItemsEnriched) {
                const existing = order.items.find(i => i.lineId === item.lineId);
                if (existing) {
                    if (existing.kitchenStatus !== 'pending') {
                        throw new Error(`Item "${existing.name}" cannot be edited — it has already been sent to the kitchen.`);
                    }
                    await tx.orderItem.update({
                        where: { id: existing.id },
                        data: {
                            qty: item.qty,
                            price: item.price,
                            note: item.note
                        }
                    });
                } else {
                    await tx.orderItem.create({
                        data: {
                            orderId: order.id,
                            productId: String(item.id),
                            productCode: item.code,
                            name: item.name,
                            qty: item.qty,
                            price: item.price,
                            cost: item.cost,
                            note: item.note,
                            addedBy: item.addedBy,
                            lineId: item.lineId
                        }
                    });
                }
            }

            await tx.order.update({
                where: { id: order.id },
                data: {
                    version: { increment: 1 },
                    lastActivityAt: new Date()
                }
            });
        });

        const updatedOrder = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
        res.json({ success: true, version: updatedOrder.version, order: updatedOrder });
    } catch (err) {
        res.status(err.message.includes('cannot be edited') ? 409 : 500).json({ error: err.message });
    }
});

// @route  DELETE /api/orders/:id/items/:lineId
router.delete('/:id/items/:lineId', async (req, res) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { items: true }
        });
        if (!order || order.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });
        if (order.isLocked) return res.status(423).json({ error: 'The bill is being processed. Please wait or ask your waiter.' });

        const item = order.items.find(i => i.lineId === req.params.lineId);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        if (item.kitchenStatus === 'preparing' || item.kitchenStatus === 'ready') {
            return res.status(409).json({ error: `This item is already being prepared. Ask your waiter for help.`, kitchenStatus: item.kitchenStatus });
        }
        if (item.kitchenStatus === 'sent' && req.userRole !== 'staff') {
            return res.status(403).json({ error: 'This item has been sent to the kitchen. Ask your waiter to cancel it.' });
        }

        await prisma.orderItem.update({
            where: { id: item.id },
            data: { kitchenStatus: 'cancelled', cancelledAt: new Date() }
        });

        await prisma.order.update({
            where: { id: order.id },
            data: { version: { increment: 1 }, lastActivityAt: new Date() }
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  POST /api/orders/:id/send
router.post('/:id/send', async (req, res) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { items: true }
        });
        if (!order || order.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });
        if (order.isLocked) return res.status(423).json({ error: 'The bill is being processed. Please wait or ask your waiter.' });

        const pendingItems = order.items.filter(i => i.kitchenStatus === 'pending');
        if (pendingItems.length === 0) return res.status(400).json({ error: 'No pending items to send to the kitchen.' });

        const batchNo = order.currentBatch + 1;
        const now = new Date();

        await prisma.$transaction([
            prisma.orderItem.updateMany({
                where: { orderId: order.id, kitchenStatus: 'pending' },
                data: { kitchenStatus: 'sent', sentAt: now, batchNo }
            }),
            prisma.order.update({
                where: { id: order.id },
                data: { currentBatch: batchNo, version: { increment: 1 }, lastActivityAt: now }
            })
        ]);

        log('ITEMS_SENT', { branch: order.branchId, table: order.tableName, orderId: order.id, batch: batchNo, count: pendingItems.length });
        res.json({ success: true, batchNo, sentCount: pendingItems.length, version: order.currentBatch + 1 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  POST /api/orders/:id/lock
router.post('/:id/lock', async (req, res) => {
    try {
        if (req.userRole === 'customer') return res.status(403).json({ error: 'Not authorized' });
        const order = await prisma.order.findUnique({ where: { id: req.params.id } });
        if (!order || order.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });

        await prisma.order.update({
            where: { id: order.id },
            data: { isLocked: true, requestedBillAt: order.requestedBillAt || new Date() }
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  POST /api/orders/:id/unlock
router.post('/:id/unlock', async (req, res) => {
    try {
        if (req.userRole === 'customer') return res.status(403).json({ error: 'Not authorized' });
        const order = await prisma.order.update({
            where: { id: req.params.id },
            data: { isLocked: false }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route  POST /api/orders/:id/close
router.post('/:id/close', async (req, res) => {
    if (req.userRole === 'customer') return res.status(403).json({ error: 'Not authorized' });

    const { method = 'cash', discount = 0, discountType = 'none', closeOverride = false } = req.body;

    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { items: true }
        });

        if (!order || order.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });
        if (order.status === 'closed') return res.json({ success: true, alreadyClosed: true, saleId: order.mappedSaleId });

        const activeItems = order.items.filter(i => !['ready', 'cancelled'].includes(i.kitchenStatus));
        if (activeItems.length > 0 && !closeOverride) {
            return res.status(409).json({ error: `${activeItems.length} item(s) are not ready yet.`, canOverride: true });
        }

        const billItems = order.items.filter(i => i.kitchenStatus !== 'cancelled');
        const subtotal = billItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
        let discountAmt = 0;
        if (discountType === 'percent') discountAmt = subtotal * (discount / 100);
        else if (discountType === 'value') discountAmt = discount;
        const total = Math.max(0, subtotal - discountAmt);

        const lastSale = await prisma.sale.findFirst({
            where: { tenantId: order.tenantId, branchId: order.branchId },
            orderBy: { date: 'desc' }
        });
        const lastNum = lastSale ? (parseInt(lastSale.receiptNo) || 0) : 0;
        const receiptNo = String(lastNum + 1).padStart(4, '0');
        const saleId = `REC-${lastNum + 1}`;

        const result = await prisma.$transaction(async (tx) => {
            const sale = await tx.sale.create({
                data: {
                    id: saleId,
                    receiptNo,
                    tenantId: order.tenantId,
                    branchId: order.branchId,
                    cashier: req.userId || 'cashier',
                    orderType: 'dine_in',
                    tableId: order.tableId,
                    tableName: order.tableName,
                    subtotal,
                    discount: discountAmt,
                    total,
                    method,
                    status: 'finished',
                    source: 'pos',
                    date: new Date(),
                    items: {
                        create: billItems.map(i => ({
                            productId: i.productId,
                            productCode: i.productCode,
                            name: i.name,
                            qty: i.qty,
                            price: i.price,
                            cost: i.cost,
                            note: i.note
                        }))
                    }
                }
            });

            for (const item of billItems) {
                await tx.productStock.upsert({
                    where: { tenantId_branchId_productId: { tenantId: order.tenantId, branchId: order.branchId, productId: item.productId } },
                    update: { qty: { decrement: item.qty } },
                    create: { tenantId: order.tenantId, branchId: order.branchId, productId: item.productId, qty: -item.qty }
                });
            }

            await tx.order.update({
                where: { id: order.id },
                data: { status: 'closed', closedAt: new Date(), mappedSaleId: saleId }
            });

            await tx.table.update({
                where: { id: order.tableId },
                data: { status: 'available', activeOrderId: null }
            });

            return sale;
        });

        res.json({ success: true, saleId: result.id, receiptNo, total });
    } catch (err) {
        console.error('Order Close Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// @route  POST /api/orders/:id/cancel
router.post('/:id/cancel', async (req, res) => {
    try {
        if (req.userRole === 'customer') return res.status(403).json({ error: 'Not authorized' });
        const order = await prisma.order.findUnique({ where: { id: req.params.id } });
        if (!order || order.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });

        await prisma.$transaction([
            prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled', closedAt: new Date() } }),
            prisma.table.update({ where: { id: order.tableId }, data: { status: 'available', activeOrderId: null } })
        ]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
