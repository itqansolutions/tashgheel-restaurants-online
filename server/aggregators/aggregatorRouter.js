/**
 * Aggregator Router
 * 
 * Provider-agnostic Express router for all delivery aggregator operations.
 * Dynamically loads the correct adapter based on :provider param.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const storage = require('../utils/storage');
const { getAdapter } = require('./adapters');
const { mapToSale, enrichItemCosts } = require('./aggregatorMapper');
const {
    encryptCredentials,
    decryptCredentials,
    getHealthStatus,
    getAllHealthStatuses,
    getAllDisplayInfo
} = require('./aggregatorService');

const AGGREGATOR_STATUSES = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    PREPARING: 'preparing',
    READY: 'ready',
    DELIVERED: 'delivered',
    REJECTED: 'rejected',
    MAPPING_FAILED: 'mapping_failed'
};

// ─── Helper: Status transition ───
async function transitionOrder(orderId, newStatus, note, tenantId) {
    const order = await prisma.aggregatorOrder.findUnique({ 
        where: { id: orderId } 
    });
    if (!order || order.tenantId !== tenantId) return null;

    const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    const updatedHistory = [...history, { status: newStatus, at: new Date(), note }];

    return await prisma.aggregatorOrder.update({
        where: { id: orderId },
        data: {
            status: newStatus,
            statusHistory: updatedHistory,
            updatedAt: new Date()
        }
    });
}

// ─── Helper: Load decrypted credentials ───
async function loadProviderCredentials(provider, branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    const settings = branch?.settings || {};
    const aggregators = settings.aggregators || {};
    const config = aggregators[provider];
    
    if (!config?.encryptedCredentials) return null;
    try {
        return decryptCredentials(config.encryptedCredentials, provider);
    } catch (e) {
        console.warn(`⚠️ Could not decrypt ${provider} credentials:`, e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════
// WEBHOOK — Public
// ═══════════════════════════════════════════════
router.post('/:provider/webhook', async (req, res) => {
    const { provider } = req.params;
    const adapter = getAdapter(provider);
    if (!adapter) return res.status(404).json({ error: 'Unknown provider' });

    if (!adapter.capabilities.webhook) {
        return res.status(400).json({ error: `${provider} does not support webhooks` });
    }

    try {
        const rawBody = req.body;
        const signature = req.headers[adapter.getSignatureHeader()];
        const secretEnvKey = `${provider.toUpperCase()}_WEBHOOK_SECRET`;
        const webhookSecret = process.env[secretEnvKey];

        if (webhookSecret && !adapter.verifySignature(rawBody, signature, webhookSecret)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const payload = JSON.parse(rawBody.toString());
        const parsed = adapter.parseOrder(payload);

        // Idempotency
        const existing = await prisma.aggregatorOrder.findUnique({
            where: {
                provider_providerOrderId: {
                    provider,
                    providerOrderId: parsed.providerOrderId
                }
            }
        });

        if (existing) return res.sendStatus(200);

        // Resolve branch - need to find a branch where this aggregator is enabled
        // In PostgreSQL with Json, we might need a specific query
        const branches = await prisma.branch.findMany({
            where: { isActive: true }
        });
        
        const branch = branches.find(b => b.settings?.aggregators?.[provider]?.enabled);

        if (!branch) {
            return res.status(400).json({ error: `No branch configured for ${provider}` });
        }

        const aggOrder = await prisma.aggregatorOrder.create({
            data: {
                provider,
                providerOrderId: parsed.providerOrderId,
                tenantId: branch.tenantId,
                branchId: branch.id,
                status: AGGREGATOR_STATUSES.PENDING,
                statusHistory: [{ status: AGGREGATOR_STATUSES.PENDING, at: new Date() }],
                rawPayload: payload,
                customer: parsed.customer,
                items: parsed.items,
                financials: parsed.financials,
                paymentMethod: parsed.paymentMethod
            }
        });

        console.log(`✅ [Aggregator] New ${provider} order ${parsed.providerOrderId} saved`);
        return res.sendStatus(200);

    } catch (err) {
        console.error(`❌ [Aggregator] Webhook error (${provider}):`, err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

// ─── List Orders ───
router.get('/orders', async (req, res) => {
    try {
        const { provider, status, limit = 50 } = req.query;
        const filter = {
            tenantId: req.tenantId,
            branchId: req.branchId
        };
        if (provider) filter.provider = provider;
        if (status) filter.status = status;

        const orders = await prisma.aggregatorOrder.findMany({
            where: filter,
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit)
        });

        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Accept Order → Create Sale ───
router.post('/orders/:id/accept', async (req, res) => {
    try {
        const order = await prisma.aggregatorOrder.findUnique({ where: { id: req.params.id } });
        if (!order || order.tenantId !== req.tenantId) return res.status(404).json({ error: 'Order not found' });
        
        if (order.status !== AGGREGATOR_STATUSES.PENDING) {
            return res.status(400).json({ error: `Cannot accept order in status: ${order.status}` });
        }

        const branch = await prisma.branch.findUnique({ where: { id: order.branchId } });

        // Generate Invoice ID
        const lastAggSale = await prisma.sale.findFirst({
            where: { tenantId: order.tenantId, branchId: order.branchId, source: 'aggregator' },
            orderBy: { date: 'desc' }
        });
        const lastNum = lastAggSale ? parseInt(lastAggSale.id.replace(/\D/g, '')) || 0 : 0;
        const nextId = `AGG-${lastNum + 1}`;

        // Map to Sale
        const saleData = mapToSale(order, branch, nextId);

        // Enrich costs
        try {
            const rawProducts = await storage.readData('spare_parts', order.tenantId);
            const products = JSON.parse(rawProducts || '[]');
            saleData.items = enrichItemCosts(saleData.items, products);
        } catch (e) { }

        // Atomic Transaction: Create Sale + Items + Deduct Stock + Update Aggregator Order
        await prisma.$transaction(async (tx) => {
            // Create Sale and SaleItems
            await tx.sale.create({
                data: {
                    id: nextId,
                    receiptNo: nextId.slice(-6),
                    tenantId: order.tenantId,
                    branchId: order.branchId,
                    subtotal: saleData.subtotal,
                    tax: saleData.tax,
                    deliveryFee: saleData.deliveryFee,
                    total: saleData.total,
                    orderType: saleData.orderType,
                    source: 'aggregator',
                    status: 'finished',
                    kitchenStatus: 'pending',
                    method: saleData.method,
                    date: new Date(),
                    customer: saleData.customer,
                    items: {
                        create: saleData.items.map(i => ({
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

            // Stock Deduction
            for (const item of saleData.items) {
                if (item.productId) {
                    await tx.productStock.updateMany({
                        where: {
                            tenantId: order.tenantId,
                            branchId: order.branchId,
                            productId: item.productId
                        },
                        data: { qty: { decrement: item.qty } }
                    });
                }
            }

            // Update Aggregator Order Status
            const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
            await tx.aggregatorOrder.update({
                where: { id: order.id },
                data: {
                    status: AGGREGATOR_STATUSES.ACCEPTED,
                    statusHistory: [...history, { status: AGGREGATOR_STATUSES.ACCEPTED, at: new Date(), note: `Mapped to Sale ${nextId}` }],
                    mappedSaleId: nextId
                }
            });
        });

        // Push status to provider (Non-blocking)
        try {
            const adapter = getAdapter(order.provider);
            if (adapter.capabilities.pushStatus) {
                const credentials = await loadProviderCredentials(order.provider, order.branchId);
                if (credentials) await adapter.pushStatus(order.providerOrderId, 'accepted', credentials);
            }
        } catch (e) { }

        res.json({ success: true, saleId: nextId });

    } catch (err) {
        console.error('Accept Order Error:', err);
        try {
            await transitionOrder(req.params.id, AGGREGATOR_STATUSES.MAPPING_FAILED, err.message);
        } catch (e) { }
        res.status(500).json({ error: err.message });
    }
});

// ─── Reject Order ───
router.post('/orders/:id/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await transitionOrder(req.params.id, AGGREGATOR_STATUSES.REJECTED, reason || 'Rejected by staff', req.tenantId);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        try {
            const adapter = getAdapter(order.provider);
            if (adapter.capabilities.pushStatus) {
                const credentials = await loadProviderCredentials(order.provider, order.branchId);
                if (credentials) await adapter.pushStatus(order.providerOrderId, 'rejected', credentials);
            }
        } catch (e) { }

        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Mark Ready ───
router.post('/orders/:id/ready', async (req, res) => {
    try {
        const order = await transitionOrder(req.params.id, AGGREGATOR_STATUSES.READY, 'Marked ready for pickup', req.tenantId);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        try {
            const adapter = getAdapter(order.provider);
            if (adapter.capabilities.pushStatus) {
                const credentials = await loadProviderCredentials(order.provider, order.branchId);
                if (credentials) await adapter.pushStatus(order.providerOrderId, 'ready', credentials);
            }
        } catch (e) { }

        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Retry Failed Mapping ───
router.post('/orders/:id/retry', async (req, res) => {
    try {
        const order = await prisma.aggregatorOrder.findUnique({ where: { id: req.params.id } });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status !== AGGREGATOR_STATUSES.MAPPING_FAILED) return res.status(400).json({ error: 'Order is not in failed state' });

        await transitionOrder(order.id, AGGREGATOR_STATUSES.PENDING, `Retry #${order.retryCount + 1}`);
        await prisma.aggregatorOrder.update({
            where: { id: order.id },
            data: { retryCount: { increment: 1 }, lastError: null }
        });

        res.json({ success: true, message: 'Order queued for retry.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Menu Sync ───
router.post('/menu/:provider/sync', async (req, res) => {
    const { provider } = req.params;
    const adapter = getAdapter(provider);
    if (!adapter || !adapter.capabilities.syncMenu) return res.status(400).json({ error: 'Sync not supported' });

    try {
        const rawProducts = await storage.readData('spare_parts', req.tenantId);
        const products = JSON.parse(rawProducts || '[]');

        const credentials = await loadProviderCredentials(provider, req.branchId);
        if (!credentials) return res.status(400).json({ error: 'Credentials missing' });
        
        const result = await adapter.syncMenu(products, credentials);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Config ───
router.get('/config/:provider', async (req, res) => {
    try {
        const branch = await prisma.branch.findUnique({ where: { id: req.branchId } });
        const config = branch?.settings?.aggregators?.[req.params.provider] || {};
        res.json({
            enabled: config.enabled || false,
            hasCredentials: !!config.encryptedCredentials,
            lastMenuSync: config.lastMenuSync || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/config/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        const { apiKey, clientId, clientSecret, enabled } = req.body;

        const branch = await prisma.branch.findUnique({ where: { id: req.branchId } });
        const settings = branch.settings || {};
        const aggregators = settings.aggregators || {};
        const config = aggregators[provider] || {};

        if (typeof enabled === 'boolean') config.enabled = enabled;
        if (apiKey && clientId && clientSecret) {
            config.encryptedCredentials = encryptCredentials({ apiKey, clientId, clientSecret }, provider);
        }

        aggregators[provider] = config;
        settings.aggregators = aggregators;

        await prisma.branch.update({
            where: { id: req.branchId },
            data: { settings }
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

// ─── Health Check ───
router.get('/health/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        const health = await getHealthStatus(provider, req.branchId, req.tenantId);
        res.json(health);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/health', async (req, res) => {
    try {
        const health = await getAllHealthStatuses(req.branchId, req.tenantId);
        res.json(health);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
