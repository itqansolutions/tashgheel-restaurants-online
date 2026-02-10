/**
 * Aggregator Router
 * 
 * Provider-agnostic Express router for all delivery aggregator operations.
 * Dynamically loads the correct adapter based on :provider param.
 */

const express = require('express');
const router = express.Router();
const AggregatorOrder = require('../models/AggregatorOrder');
const { AGGREGATOR_STATUSES } = require('../models/AggregatorOrder');
const Sale = require('../models/Sale');
const ProductStock = require('../models/ProductStock');
const Branch = require('../models/Branch');
const storage = require('../utils/storage');
const { getAdapter, listProviders } = require('./adapters');
const { mapToSale, enrichItemCosts } = require('./aggregatorMapper');
const {
    encryptCredentials,
    decryptCredentials,
    getHealthStatus,
    getAllHealthStatuses,
    getAllDisplayInfo
} = require('./aggregatorService');

const auth = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

// ═══════════════════════════════════════════════
// WEBHOOK — Public (HMAC-verified, no JWT)
// ═══════════════════════════════════════════════

router.post('/:provider/webhook', async (req, res) => {
    const { provider } = req.params;
    const adapter = getAdapter(provider);
    if (!adapter) return res.status(404).json({ error: 'Unknown provider' });

    // Check capability
    if (!adapter.capabilities.webhook) {
        return res.status(400).json({ error: `${provider} does not support webhooks` });
    }

    try {
        // Raw body for HMAC verification
        const rawBody = req.body; // Will be a Buffer because of express.raw()
        const signature = req.headers[adapter.getSignatureHeader()];
        const webhookSecret = process.env.TALABAT_WEBHOOK_SECRET; // TODO: per-provider secrets

        // Verify signature
        if (webhookSecret && !adapter.verifySignature(rawBody, signature, webhookSecret)) {
            console.warn(`⚠️ [Aggregator] Invalid ${provider} webhook signature`);
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Parse the raw body
        const payload = JSON.parse(rawBody.toString());

        // Parse order using adapter
        const parsed = adapter.parseOrder(payload);

        // Idempotency check
        const existing = await AggregatorOrder.findOne({
            provider,
            providerOrderId: parsed.providerOrderId
        });

        if (existing) {
            console.log(`ℹ️ [Aggregator] Duplicate ${provider} order ${parsed.providerOrderId}, skipping`);
            return res.sendStatus(200);
        }

        // Determine branch (from payload or config — for now use first active branch of tenant)
        // TODO: Map provider store ID → branchId via config
        const tenantId = payload.tenantId; // This would come from config mapping
        const branchId = payload.branchId;

        // Save order
        const aggOrder = new AggregatorOrder({
            provider,
            providerOrderId: parsed.providerOrderId,
            tenantId,
            branchId,
            status: AGGREGATOR_STATUSES.PENDING,
            statusHistory: [{ status: AGGREGATOR_STATUSES.PENDING, at: new Date() }],
            rawPayload: payload,
            customer: parsed.customer,
            items: parsed.items,
            financials: parsed.financials,
            paymentMethod: parsed.paymentMethod
        });

        await aggOrder.save();
        console.log(`✅ [Aggregator] New ${provider} order ${parsed.providerOrderId} saved`);

        return res.sendStatus(200);

    } catch (err) {
        console.error(`❌ [Aggregator] Webhook error (${provider}):`, err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

// ═══════════════════════════════════════════════
// AUTHENTICATED ROUTES (JWT + Branch Scope)
// ═══════════════════════════════════════════════
router.use(auth);
router.use(branchScope);

// ─── Get Provider Info (for frontend rendering) ───
router.get('/providers', (req, res) => {
    res.json(getAllDisplayInfo());
});

// ─── List Orders for Current Branch ───
router.get('/orders', async (req, res) => {
    try {
        const { provider, status, limit = 50 } = req.query;
        const query = {
            tenantId: req.tenantId,
            branchId: req.branchId
        };
        if (provider) query.provider = provider;
        if (status) query.status = status;

        const orders = await AggregatorOrder.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Accept Order → Create Sale ───
router.post('/orders/:id/accept', async (req, res) => {
    try {
        const order = await AggregatorOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status !== AGGREGATOR_STATUSES.PENDING) {
            return res.status(400).json({ error: `Cannot accept order in status: ${order.status}` });
        }

        // Get branch for mapping
        const branch = await Branch.findById(order.branchId);

        // Generate next invoice ID
        const lastSale = await Sale.findOne({ tenantId: order.tenantId, branchId: order.branchId })
            .sort({ date: -1 }).lean();
        const lastNum = lastSale ? parseInt(lastSale.id.replace(/\D/g, '')) || 0 : 0;
        const nextId = `AGG-${lastNum + 1}`;

        // Map to Sale
        const saleData = mapToSale(order, branch, nextId);

        // Enrich costs from products
        try {
            const rawProducts = await storage.readData('products', order.tenantId);
            const products = JSON.parse(rawProducts || '[]');
            saleData.items = enrichItemCosts(saleData.items, products);
        } catch (e) {
            console.warn('⚠️ Could not enrich item costs:', e.message);
        }

        // Save Sale
        const newSale = new Sale(saleData);
        await newSale.save();

        // Deduct inventory
        try {
            for (const item of saleData.items) {
                if (item.id) {
                    await ProductStock.findOneAndUpdate(
                        { tenantId: order.tenantId, branchId: order.branchId, productId: item.id },
                        { $inc: { qty: -item.qty } }
                    );
                }
            }
        } catch (e) {
            console.warn('⚠️ Stock deduction partial failure:', e.message);
        }

        // Update aggregator order
        order.transitionTo(AGGREGATOR_STATUSES.ACCEPTED, `Mapped to Sale ${nextId}`);
        order.mappedSaleId = nextId;
        await order.save();

        // Push status to provider
        try {
            const adapter = getAdapter(order.provider);
            if (adapter.capabilities.pushStatus) {
                // TODO: Load decrypted credentials from branch config
                // await adapter.pushStatus(order.providerOrderId, 'accepted', credentials);
            }
        } catch (e) {
            console.warn(`⚠️ Could not push status to ${order.provider}:`, e.message);
        }

        res.json({ success: true, saleId: nextId, order });

    } catch (err) {
        // Handle mapping failure gracefully
        try {
            const order = await AggregatorOrder.findById(req.params.id);
            if (order) {
                order.transitionTo(AGGREGATOR_STATUSES.MAPPING_FAILED, err.message);
                order.retryCount += 1;
                order.lastError = err.message;
                await order.save();
            }
        } catch (saveErr) {
            console.error('❌ Could not save failure state:', saveErr.message);
        }
        res.status(500).json({ error: err.message });
    }
});

// ─── Reject Order ───
router.post('/orders/:id/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await AggregatorOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        order.transitionTo(AGGREGATOR_STATUSES.REJECTED, reason || 'Rejected by staff');
        await order.save();

        // Notify provider
        try {
            const adapter = getAdapter(order.provider);
            if (adapter.capabilities.pushStatus) {
                // await adapter.pushStatus(order.providerOrderId, 'rejected', credentials);
            }
        } catch (e) {
            console.warn(`⚠️ Could not push rejection to ${order.provider}:`, e.message);
        }

        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Mark Ready ───
router.post('/orders/:id/ready', async (req, res) => {
    try {
        const order = await AggregatorOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        order.transitionTo(AGGREGATOR_STATUSES.READY, 'Marked ready for pickup');
        await order.save();

        try {
            const adapter = getAdapter(order.provider);
            if (adapter.capabilities.pushStatus) {
                // await adapter.pushStatus(order.providerOrderId, 'ready', credentials);
            }
        } catch (e) {
            console.warn(`⚠️ Could not push ready status to ${order.provider}:`, e.message);
        }

        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Retry Failed Mapping ───
router.post('/orders/:id/retry', async (req, res) => {
    try {
        const order = await AggregatorOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status !== AGGREGATOR_STATUSES.MAPPING_FAILED) {
            return res.status(400).json({ error: 'Order is not in failed state' });
        }

        // Reset to pending for re-processing
        order.transitionTo(AGGREGATOR_STATUSES.PENDING, `Retry #${order.retryCount + 1}`);
        order.retryCount += 1;
        order.lastError = null;
        await order.save();

        res.json({ success: true, message: 'Order queued for retry. Accept it again to process.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Menu Sync ───
router.post('/menu/sync/:provider', async (req, res) => {
    const { provider } = req.params;
    const adapter = getAdapter(provider);
    if (!adapter) return res.status(404).json({ error: 'Unknown provider' });
    if (!adapter.capabilities.syncMenu) {
        return res.status(400).json({ error: `${provider} does not support menu sync` });
    }

    try {
        const rawProducts = await storage.readData('products', req.tenantId);
        const products = JSON.parse(rawProducts || '[]');

        // TODO: Load decrypted credentials from branch config
        // const result = await adapter.syncMenu(products, credentials);

        res.json({ success: true, message: `Menu sync to ${provider} initiated`, itemCount: products.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Config (Per-Provider Per-Branch) ───
router.get('/config/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        const branch = await Branch.findById(req.branchId);
        const config = branch?.settings?.aggregators?.[provider] || {};
        // Don't send encrypted credentials back — just flags
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

        const update = {};
        if (typeof enabled === 'boolean') {
            update[`settings.aggregators.${provider}.enabled`] = enabled;
        }
        if (apiKey && clientId && clientSecret) {
            const encrypted = encryptCredentials({ apiKey, clientId, clientSecret }, provider);
            update[`settings.aggregators.${provider}.encryptedCredentials`] = encrypted;
        }

        await Branch.findByIdAndUpdate(req.branchId, { $set: update });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
