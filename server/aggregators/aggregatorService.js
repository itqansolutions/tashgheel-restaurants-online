/**
 * Aggregator Service
 * 
 * Handles credential encryption/decryption, health checks,
 * and cross-cutting concerns for all providers.
 */

const crypto = require('crypto');
const prisma = require('../prisma');
const { getAdapter, listProviders } = require('./adapters');

// ─── Credential encryption (AES-256-GCM, key derived per provider) ───
// Master key: AGGREGATOR_ENCRYPTION_MASTER_KEY if set, otherwise the server JWT secret.
function getMasterKey() {
    const key = process.env.AGGREGATOR_ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET;
    if (!key) throw new Error('No encryption key configured (set AGGREGATOR_ENCRYPTION_MASTER_KEY)');
    return key;
}
function deriveProviderKey(provider) {
    return crypto.createHash('sha256').update(getMasterKey() + ':' + provider).digest();
}
function encryptCredentials(credentials, provider) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveProviderKey(provider), iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
    return 'v2:' + iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + enc.toString('hex');
}
function decryptCredentials(str, provider) {
    const parts = String(str).split(':');
    if (parts[0] !== 'v2' || parts.length !== 4) throw new Error('Unsupported credential format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveProviderKey(provider), Buffer.from(parts[1], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
    const out = Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
}

// ─── Credential fields each provider panel shows (all optional until the provider issues them) ───
const CREDENTIAL_FIELDS = {
    talabat: [
        { key: 'apiKey', label: 'API Key' }, { key: 'clientId', label: 'Client ID' },
        { key: 'clientSecret', label: 'Client Secret' }, { key: 'webhookSecret', label: 'Webhook Secret' }
    ],
    uber_eats: [
        { key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client Secret' },
        { key: 'storeId', label: 'Store ID' }, { key: 'webhookSecret', label: 'Webhook Secret' }
    ],
    careem_now: [
        { key: 'apiKey', label: 'API Key' }, { key: 'clientSecret', label: 'Client Secret' },
        { key: 'webhookSecret', label: 'Webhook Secret' }
    ],
    mrsool: [
        { key: 'apiKey', label: 'API Key' }, { key: 'clientSecret', label: 'Client Secret' },
        { key: 'webhookSecret', label: 'Webhook Secret' }
    ]
};

/** Read a branch's stored config and credentials. Secrets never leave this module except to adapters. */
function readBranchConfig(branch, provider) {
    const config = (branch?.settings?.aggregators || {})[provider] || {};
    let credentials = null;
    if (config.encryptedCredentials) {
        try { credentials = decryptCredentials(config.encryptedCredentials, provider); } catch (e) { credentials = null; }
    }
    return { config, credentials };
}

/** Public, secret-free status for one provider on one branch. */
async function getProviderStatus(provider, branch, tenantId, baseUrl) {
    const adapter = getAdapter(provider);
    if (!adapter) return null;
    const { config, credentials } = readBranchConfig(branch, provider);
    const fields = (CREDENTIAL_FIELDS[provider] || []).map(f => ({ ...f, set: !!(credentials && credentials[f.key]) }));
    const hasCredentials = !!credentials && fields.some(f => f.set);
    const enabled = !!config.enabled;
    const adapterReady = !!adapter.capabilities.webhook;
    const hasWebhookSecret = !!(credentials && credentials.webhookSecret);
    let status = 'not_connected';
    if (!adapterReady) status = 'not_available';
    else if (hasCredentials && enabled && hasWebhookSecret) status = 'connected';
    else if (hasCredentials) status = 'saved';
    const lastOrder = await prisma.aggregatorOrder.findFirst({
        where: { provider, branchId: branch.id, tenantId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true }
    });
    const pendingCount = await prisma.aggregatorOrder.count({ where: { provider, branchId: branch.id, tenantId, status: 'pending' } });
    return {
        provider, name: adapter.displayInfo.name, status, adapterReady, enabled, hasCredentials, hasWebhookSecret,
        fields, webhookUrl: `${baseUrl}/api/aggregator/${provider}/webhook/${branch.id}`,
        lastOrderAt: lastOrder?.createdAt || null, pendingCount,
        lastMenuSync: config.lastMenuSync || null
    };
}

/**
 * Get health status for a specific provider + branch
 */
async function getHealthStatus(provider, branchId, tenantId) {
    const adapter = getAdapter(provider);
    if (!adapter) return { error: 'Unknown provider' };

    // Last order received
    const lastOrder = await prisma.aggregatorOrder.findFirst({
        where: { provider, branchId, tenantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
    });

    // Counts by status
    const statusCounts = await prisma.aggregatorOrder.groupBy({
        by: ['status'],
        where: { provider, branchId, tenantId },
        _count: { _all: true }
    });

    const counts = {};
    statusCounts.forEach(s => { counts[s.status] = s._count._all; });

    return {
        provider,
        adapterName: adapter.displayInfo.name,
        capabilities: adapter.capabilities,
        connected: adapter.capabilities.webhook || adapter.capabilities.polling,
        lastWebhook: lastOrder?.createdAt || null,
        orderCounts: counts,
        pendingCount: counts.pending || 0,
        failedCount: counts.mapping_failed || 0
    };
}

/**
 * Get health status for all providers
 */
async function getAllHealthStatuses(branchId, tenantId) {
    const results = {};
    for (const provider of listProviders()) {
        results[provider] = await getHealthStatus(provider, branchId, tenantId);
    }
    return results;
}

/**
 * Get display info for all providers (for frontend rendering)
 */
function getAllDisplayInfo() {
    const info = {};
    for (const providerKey of listProviders()) {
        const adapter = getAdapter(providerKey);
        info[providerKey] = {
            ...adapter.displayInfo,
            capabilities: adapter.capabilities
        };
    }
    return info;
}

module.exports = {
    CREDENTIAL_FIELDS,
    readBranchConfig,
    getProviderStatus,
    encryptCredentials,
    decryptCredentials,
    getHealthStatus,
    getAllHealthStatuses,
    getAllDisplayInfo
};
