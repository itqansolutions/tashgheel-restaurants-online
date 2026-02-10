/**
 * Aggregator Service
 * 
 * Handles credential encryption/decryption, health checks,
 * and cross-cutting concerns for all providers.
 */

const crypto = require('crypto');
const AggregatorOrder = require('../models/AggregatorOrder');
const { getAdapter, listProviders } = require('./adapters');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// ─── Master encryption key (derive per-provider keys from this) ───
function getMasterKey() {
    const key = process.env.AGGREGATOR_ENCRYPTION_MASTER_KEY;
    if (!key) throw new Error('AGGREGATOR_ENCRYPTION_MASTER_KEY not set');
    return key;
}

/**
 * Derive a per-provider encryption key from master key
 * Limits blast radius if one provider's data is compromised
 */
function deriveProviderKey(provider) {
    const master = getMasterKey();
    return crypto.createHash('sha256')
        .update(master + ':' + provider)
        .digest(); // 32-byte key
}

/**
 * Encrypt credentials before storing
 * @param {object} credentials - Plain text credentials object
 * @param {string} provider - Provider key for key derivation
 * @returns {string} Encrypted string (iv:encrypted)
 */
function encryptCredentials(credentials, provider) {
    const key = deriveProviderKey(provider);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt stored credentials
 * @param {string} encryptedStr - Format: iv:encrypted
 * @param {string} provider - Provider key for key derivation
 * @returns {object} Decrypted credentials object
 */
function decryptCredentials(encryptedStr, provider) {
    const key = deriveProviderKey(provider);
    const [ivHex, encrypted] = encryptedStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
}

/**
 * Get health status for a specific provider + branch
 * @param {string} provider 
 * @param {ObjectId} branchId 
 * @param {ObjectId} tenantId 
 * @returns {object}
 */
async function getHealthStatus(provider, branchId, tenantId) {
    const adapter = getAdapter(provider);
    if (!adapter) return { error: 'Unknown provider' };

    // Last webhook received
    const lastOrder = await AggregatorOrder.findOne(
        { provider, branchId, tenantId },
        { createdAt: 1 }
    ).sort({ createdAt: -1 }).lean();

    // Counts by status
    const statusCounts = await AggregatorOrder.aggregate([
        { $match: { provider, branchId, tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const counts = {};
    statusCounts.forEach(s => { counts[s._id] = s.count; });

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
    encryptCredentials,
    decryptCredentials,
    getHealthStatus,
    getAllHealthStatuses,
    getAllDisplayInfo
};
