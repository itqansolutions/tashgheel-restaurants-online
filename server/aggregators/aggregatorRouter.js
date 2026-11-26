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
const {readCatalog,snapshotItems}=require('../utils/catalog');
const {applyStock}=require('../utils/stock');
const crypto=require('crypto');
const { getAdapter, listProviders } = require('./adapters');
const auth = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');
const roleGuard = require('../middleware/roleGuard');
const rateLimit = require('express-rate-limit');
const { mapToSale, enrichItemCosts } = require('./aggregatorMapper');
const {
    encryptCredentials,
    decryptCredentials,
    getHealthStatus,
    getAllHealthStatuses,
    getAllDisplayInfo,
    CREDENTIAL_FIELDS,
    readBranchConfig,
    getProviderStatus
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
    return readBranchConfig(branch, provider).credentials;
}

// ═══════════════════════════════════════════════
// WEBHOOK — Public, one URL per provider AND branch:
//   POST /api/aggregator/:provider/webhook/:branchId
// The branch id picks the tenant. The payload must be signed with the webhook secret the owner
// saved for that provider and branch; unsigned or wrongly signed calls are rejected.
// ═══════════════════════════════════════════════
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: 'Too many requests' } });

router.post('/:provider/webhook', webhookLimiter, (req, res) => {
    res.status(400).json({ error: 'Use the per-branch webhook URL shown in Settings > Delivery Integrations' });
});

router.post(['/:provider/webhook/:branchId', '/:provider/webhook/:branchId/order/:remoteId'], webhookLimiter, async (req, res) => {
    const { provider, branchId } = req.params;
    const adapter = getAdapter(provider);
    if (!adapter) return res.status(404).json({ error: 'Unknown provider' });
    if (!adapter.capabilities.webhook) {
        return res.status(501).json({ error: `${provider} integration is not available yet` });
    }

    try {
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        const { config, credentials } = readBranchConfig(branch, provider);
        // Same answer for unknown branch, switched off, or no secret: nothing to learn from probing.
        if (!branch || !branch.isActive || !config.enabled || !credentials?.webhookSecret) {
            return res.status(404).json({ error: 'Not configured' });
        }

        const rawBody = req.body;
        if (!Buffer.isBuffer(rawBody)) return res.status(400).json({ error: 'JSON body required' });
        let valid = false;
        try {
            if (typeof adapter.verifyRequest === 'function') valid = adapter.verifyRequest(req.headers, rawBody, credentials.webhookSecret);
            else valid = adapter.verifySignature(rawBody, req.headers[adapter.getSignatureHeader()], credentials.webhookSecret);
        } catch (e) { valid = false; }
        if (!valid) return res.status(401).json({ error: 'Invalid signature' });

        let payload;
        try { payload = JSON.parse(rawBody.toString()); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }
        const parsed = adapter.parseOrder(payload);
        // Non-order events (store status, cancellations handled below) are acknowledged and ignored.
        if (!parsed) return res.sendStatus(200);
        if (!parsed.providerOrderId || parsed.providerOrderId === 'undefined') return res.status(400).json({ error: 'Order id missing' });

        const existing = await prisma.aggregatorOrder.findUnique({
            where: { provider_providerOrderId: { provider, providerOrderId: parsed.providerOrderId } }
        });
        if (existing) return res.sendStatus(200);

        await prisma.aggregatorOrder.create({
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
        console.log(`[Aggregator] New ${provider} order ${parsed.providerOrderId} saved`);
        return res.sendStatus(200);
    } catch (err) {
        console.error(`[Aggregator] Webhook error (${provider}):`, err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

// Everything below needs a logged-in staff user and a resolved branch.
router.use(auth, roleGuard, branchScope);

// ─── Provider display info (kitchen screen colours and labels) ───
router.get('/providers', (req, res) => {
    try { res.json(getAllDisplayInfo()); } catch (err) { res.status(500).json({ error: err.message }); }
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
        let order;
        const result=await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId} FOR UPDATE`;
            order=await tx.aggregatorOrder.findUnique({where:{id:req.params.id}});
            const fail=(message,status=409)=>{const err=new Error(message);err.status=status;throw err};
            if(!order || order.tenantId!==req.tenantId || order.branchId!==req.branchId) fail('Order not found',404);
            if(order.mappedSaleId) return {saleId:order.mappedSaleId,replayed:true};
            if(order.status!==AGGREGATOR_STATUSES.PENDING) fail('Order is not pending');
            const branch=await tx.branch.findUnique({where:{id:order.branchId}});
            const nextId='AGG-'+crypto.randomUUID();
            const saleData=mapToSale(order,branch,nextId);
            saleData.items=snapshotItems(saleData.items,await readCatalog(tx,req.tenantId));
            await tx.sale.create({data:{id:nextId,receiptNo:nextId.slice(-6),tenantId:req.tenantId,branchId:req.branchId,subtotal:saleData.subtotal,tax:saleData.tax,deliveryFee:saleData.deliveryFee,total:saleData.total,orderType:saleData.orderType,source:'aggregator',aggregatorOrderId:order.id,status:'finished',kitchenStatus:'pending',method:saleData.method,date:new Date(),customer:saleData.customer,items:{create:saleData.items.map(i=>({productId:String(i.id),productCode:i.productCode,name:i.name,qty:i.qty,price:i.price,cost:i.cost,note:i.note}))}}});
            const movements=await applyStock(tx,req.tenantId,req.branchId,saleData.items);
            await tx.auditLog.create({data:{tenantId:req.tenantId,branchId:req.branchId,userId:req.userId,action:'SALE_CREATE',details:{saleId:nextId,aggregatorOrderId:order.id,movements},ipAddress:req.ip}});
            await tx.aggregatorOrder.update({where:{id:order.id},data:{status:AGGREGATOR_STATUSES.ACCEPTED,statusHistory:[...(Array.isArray(order.statusHistory)?order.statusHistory:[]),{status:AGGREGATOR_STATUSES.ACCEPTED,at:new Date(),note:'Mapped to Sale '+nextId}],mappedSaleId:nextId}});
            return {saleId:nextId};
        });

        // Push status to provider (Non-blocking)
        try {
            const adapter = getAdapter(order.provider);
            if (!result.replayed && adapter.capabilities.pushStatus) {
                const credentials = await loadProviderCredentials(order.provider, order.branchId);
                if (credentials) await adapter.pushStatus(order.providerOrderId, 'accepted', credentials, order);
            }
        } catch (e) { }

        res.json({ success: true, ...result });

    } catch (err) {
        console.error('Accept Order Error:', err);
        res.status(err.status||500).json({ error: err.message });
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
                if (credentials) await adapter.pushStatus(order.providerOrderId, 'rejected', credentials, order);
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
                if (credentials) await adapter.pushStatus(order.providerOrderId, 'ready', credentials, order);
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
        if (!order || order.tenantId !== req.tenantId || order.branchId !== req.branchId) return res.status(404).json({ error: 'Order not found' });
        if (order.status !== AGGREGATOR_STATUSES.MAPPING_FAILED) return res.status(400).json({ error: 'Order is not in failed state' });

        await transitionOrder(order.id, AGGREGATOR_STATUSES.PENDING, `Retry #${order.retryCount + 1}`, req.tenantId);
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

// ─── Status, config, test (never returns secrets) ───
const baseUrlOf = req => (process.env.PUBLIC_BASE_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

async function currentBranch(req) { return prisma.branch.findFirst({ where: { id: req.branchId, tenantId: req.tenantId } }); }

router.get('/status', async (req, res) => {
    try {
        const branch = await currentBranch(req);
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        const providers = {};
        for (const p of listProviders()) providers[p] = await getProviderStatus(p, branch, req.tenantId, baseUrlOf(req));
        res.json({ branchId: branch.id, providers });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/config/:provider', async (req, res) => {
    try {
        if (!getAdapter(req.params.provider)) return res.status(404).json({ error: 'Unknown provider' });
        const branch = await currentBranch(req);
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        res.json(await getProviderStatus(req.params.provider, branch, req.tenantId, baseUrlOf(req)));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Save credentials (partial: blank fields keep what is already stored) and the on/off switch.
router.put('/config/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        if (!getAdapter(provider)) return res.status(404).json({ error: 'Unknown provider' });
        const allowed = (CREDENTIAL_FIELDS[provider] || []).map(f => f.key);
        const incoming = (req.body && typeof req.body.credentials === 'object' && req.body.credentials) || req.body || {};

        const branch = await currentBranch(req);
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        const settings = { ...(branch.settings || {}) };
        const aggregators = { ...(settings.aggregators || {}) };
        const config = { ...(aggregators[provider] || {}) };
        const existing = readBranchConfig(branch, provider).credentials || {};

        const merged = { ...existing };
        for (const key of allowed) {
            const v = incoming[key];
            if (typeof v === 'string' && v.trim()) {
                if (v.trim().length > 500) return res.status(400).json({ error: `${key} is too long` });
                merged[key] = v.trim();
            }
        }
        if (Object.keys(merged).length) config.encryptedCredentials = encryptCredentials(merged, provider);
        if (typeof req.body.enabled === 'boolean') config.enabled = req.body.enabled;

        aggregators[provider] = config;
        settings.aggregators = aggregators;
        await prisma.branch.update({ where: { id: branch.id }, data: { settings } });
        const fresh = await currentBranch(req);
        res.json({ success: true, ...(await getProviderStatus(provider, fresh, req.tenantId, baseUrlOf(req))) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remove the saved keys and switch the provider off.
router.delete('/config/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        if (!getAdapter(provider)) return res.status(404).json({ error: 'Unknown provider' });
        const branch = await currentBranch(req);
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        const settings = { ...(branch.settings || {}) };
        const aggregators = { ...(settings.aggregators || {}) };
        aggregators[provider] = { enabled: false };
        settings.aggregators = aggregators;
        await prisma.branch.update({ where: { id: branch.id }, data: { settings } });
        const fresh = await currentBranch(req);
        res.json({ success: true, ...(await getProviderStatus(provider, fresh, req.tenantId, baseUrlOf(req))) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Live check against the provider. Only runs when the owner has saved keys and the adapter is built.
router.post('/test/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        const adapter = getAdapter(provider);
        if (!adapter) return res.status(404).json({ error: 'Unknown provider' });
        if (!adapter.capabilities.webhook) return res.json({ ok: false, reason: 'not_available', message: 'This provider integration is not built yet.' });
        const branch = await currentBranch(req);
        const { credentials } = readBranchConfig(branch, provider);
        if (!credentials || !(credentials.apiKey || credentials.clientSecret)) return res.json({ ok: false, reason: 'no_credentials', message: 'Save the provider keys first.' });
        const ok = await adapter.testConnection(credentials);
        res.json({ ok, reason: ok ? 'ok' : 'rejected', message: ok ? 'Provider accepted the keys.' : 'Provider did not accept the keys.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/health', async (req, res) => {
    try {
        const branch = await currentBranch(req);
        const out = {};
        for (const p of listProviders()) out[p] = await getProviderStatus(p, branch, req.tenantId, baseUrlOf(req));
        res.json({ providers: out });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
