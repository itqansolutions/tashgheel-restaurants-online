/**
 * Talabat Adapter — Full Implementation
 * 
 * Reference adapter for the Aggregator Hub.
 * All other adapters must implement the same interface.
 */

const crypto = require('crypto');
const axios = require('axios');

const TALABAT_API_BASE = process.env.TALABAT_API_BASE_URL || 'https://api.talabat.com/v2';

// ─── Capability Flags ───
const capabilities = {
    webhook: true,
    pushStatus: true,
    syncMenu: true,
    codSupported: true,
    polling: false  // Talabat uses webhooks, no polling needed
};

// ─── Provider Display Info ───
const displayInfo = {
    name: 'Talabat',
    color: '#FF5A00',       // Talabat orange
    badgeClass: 'talabat',
    icon: '🟠'
};

/**
 * Verify HMAC-SHA256 webhook signature
 * @param {Buffer} rawBody - Raw request body buffer
 * @param {string} signature - Signature from header
 * @param {string} secret - Webhook signing secret
 * @returns {boolean}
 */
function verifySignature(rawBody, signature, secret) {
    if (!signature || !secret) return false;
    const computed = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(signature, 'hex')
    );
}

/**
 * Parse raw Talabat order payload into unified format
 * @param {object} rawPayload - Parsed JSON from Talabat webhook
 * @returns {object} Unified order fields
 */
function parseOrder(rawPayload) {
    const order = rawPayload.order || rawPayload;

    return {
        providerOrderId: String(order.id || order.order_id || order.orderId),
        customer: {
            name: order.customer?.name || order.customerName || '',
            phone: order.customer?.phone || order.customerPhone || '',
            address: order.delivery_address?.address || order.customer?.address || ''
        },
        items: (order.items || order.order_items || []).map(item => ({
            providerItemId: String(item.id || item.item_id || ''),
            name: item.name || item.title || '',
            qty: item.quantity || item.qty || 1,
            price: parseFloat(item.unit_price || item.price || 0),
            notes: item.special_instructions || item.notes || ''
        })),
        financials: {
            total: parseFloat(order.total || order.grand_total || 0),
            vat: parseFloat(order.vat || order.tax || 0),
            currency: order.currency || 'EGP',
            fees: {
                commission: parseFloat(order.commission || 0),
                service: parseFloat(order.service_fee || 0),
                delivery: parseFloat(order.delivery_fee || order.deliveryFee || 0)
            }
        },
        paymentMethod: (order.payment_method || order.paymentMethod || '').toLowerCase().includes('cash') ? 'cod' : 'online'
    };
}

/**
 * Map internal status → Talabat API status string
 * @param {string} internalStatus - One of AGGREGATOR_STATUSES
 * @returns {string} Talabat status string
 */
function mapStatus(internalStatus) {
    const map = {
        'accepted': 'ACCEPTED',
        'preparing': 'IN_PREPARATION',
        'ready': 'READY_FOR_PICKUP',
        'delivered': 'DELIVERED',
        'rejected': 'REJECTED'
    };
    return map[internalStatus] || internalStatus.toUpperCase();
}

/**
 * Push status update back to Talabat
 * @param {string} providerOrderId 
 * @param {string} internalStatus 
 * @param {object} credentials - { apiKey, clientId, clientSecret }
 * @returns {Promise<object>}
 */
async function pushStatus(providerOrderId, internalStatus, credentials) {
    const talabatStatus = mapStatus(internalStatus);
    const response = await axios.put(
        `${TALABAT_API_BASE}/orders/${providerOrderId}/status`,
        { status: talabatStatus },
        {
            headers: {
                'Authorization': `Bearer ${credentials.apiKey}`,
                'Content-Type': 'application/json',
                'X-Client-Id': credentials.clientId
            },
            timeout: 10000
        }
    );
    return response.data;
}

/**
 * Sync menu/catalog to Talabat
 * @param {Array} products - Your product list
 * @param {object} credentials 
 * @returns {Promise<object>}
 */
async function syncMenu(products, credentials) {
    const catalog = products.map(p => ({
        id: String(p.id),
        name: p.name,
        description: p.description || '',
        price: parseFloat(p.price || 0),
        category: p.category || 'General',
        available: p.available !== false,
        image_url: p.image || ''
    }));

    const response = await axios.post(
        `${TALABAT_API_BASE}/catalog/items`,
        { items: catalog },
        {
            headers: {
                'Authorization': `Bearer ${credentials.apiKey}`,
                'Content-Type': 'application/json',
                'X-Client-Id': credentials.clientId
            },
            timeout: 30000
        }
    );
    return response.data;
}

/**
 * Test API connection
 * @param {object} credentials 
 * @returns {Promise<boolean>}
 */
async function testConnection(credentials) {
    try {
        const response = await axios.get(
            `${TALABAT_API_BASE}/restaurant/status`,
            {
                headers: {
                    'Authorization': `Bearer ${credentials.apiKey}`,
                    'X-Client-Id': credentials.clientId
                },
                timeout: 10000
            }
        );
        return response.status === 200;
    } catch (err) {
        return false;
    }
}

/**
 * Get the webhook signature header name
 */
function getSignatureHeader() {
    return 'x-talabat-signature';
}

module.exports = {
    capabilities,
    displayInfo,
    verifySignature,
    parseOrder,
    mapStatus,
    pushStatus,
    syncMenu,
    testConnection,
    getSignatureHeader
};
