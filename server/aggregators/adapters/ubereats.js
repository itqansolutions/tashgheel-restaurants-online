/**
 * Uber Eats adapter (Marketplace Order API), receive path built to the public docs:
 *   https://developer.uber.com/docs/eats/guides/webhooks
 *   https://developer.uber.com/docs/eats/references/api/webhooks.orders-notification
 *   https://developer.uber.com/docs/eats/guides/order-integration
 * Webhook: X-Uber-Signature = lowercase hex HMAC-SHA256 of the raw body, key = the app client secret.
 * The webhook holds only ids; full order details need an OAuth call (GET resource_href), which needs
 * Uber-approved credentials. Accept/deny (POST /accept_pos_order, /deny_pos_order within 11.5 min) are
 * likewise only callable with those credentials.
 */
const crypto = require('crypto');
const axios = require('axios');

const capabilities = { webhook: true, pushStatus: true, syncMenu: false, codSupported: false, polling: false };
const displayInfo = { name: 'Uber Eats', color: '#06C167', badgeClass: 'uber-eats', icon: '🟢' };

function verifySignature(rawBody, signature, secret) {
    if (!signature || !secret) return false;
    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(computed), b = Buffer.from(String(signature).toLowerCase());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Only orders.notification creates an order. Other event types are acknowledged and ignored. */
function parseOrder(raw) {
    if (raw.event_type !== 'orders.notification') return null;
    const id = raw.meta && raw.meta.resource_id;
    return {
        providerOrderId: id ? String(id) : undefined,
        customer: { name: '', phone: '', address: '' },
        items: [],
        financials: { total: 0, vat: 0, currency: 'EGP', fees: { commission: 0, service: 0, delivery: 0 } },
        paymentMethod: 'online',
        needsDetailFetch: true
    };
}

function mapStatus(s) { return s; }

async function getToken(credentials) {
    // Uber OAuth client-credentials flow (endpoint/scope from Uber's general auth docs; unverified here).
    const r = await axios.post('https://login.uber.com/oauth/v2/token', new URLSearchParams({
        client_id: credentials.clientId, client_secret: credentials.clientSecret,
        grant_type: 'client_credentials', scope: 'eats.order'
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
    return r.data.access_token;
}

async function pushStatus(providerOrderId, internalStatus, credentials) {
    if (!credentials || !credentials.clientId || !credentials.clientSecret) return { skipped: true };
    const path = internalStatus === 'accepted' ? 'accept_pos_order' : internalStatus === 'rejected' ? 'deny_pos_order' : null;
    if (!path) return { skipped: true, reason: 'no uber call for this status' };
    const token = await getToken(credentials);
    const body = internalStatus === 'rejected' ? { reason: { explanation: 'Restaurant unable to fulfil this order' } } : {};
    const r = await axios.post(`https://api.uber.com/v1/eats/orders/${encodeURIComponent(providerOrderId)}/${path}`, body,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 });
    return r.data;
}

async function syncMenu() { throw new Error('Uber Eats menu sync not built'); }
async function testConnection(credentials) {
    try { return !!(credentials && credentials.clientId && credentials.clientSecret && await getToken(credentials)); } catch (e) { return false; }
}
function getSignatureHeader() { return 'x-uber-signature'; }

module.exports = { capabilities, displayInfo, verifySignature, parseOrder, mapStatus, pushStatus, syncMenu, testConnection, getSignatureHeader };
