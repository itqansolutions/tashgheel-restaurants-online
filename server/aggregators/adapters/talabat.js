/**
 * Talabat adapter (Delivery Hero POS "plugin" model)
 *
 * Built from the public Delivery Hero / Talabat integration docs:
 *   https://integration.talabat.com/en/documentation/
 *   https://developers.deliveryhero.com/documentation/pos.html
 * Talabat is partner-only: the middleware pushes orders to OUR plugin endpoint
 * (POST {base}/order/{remoteId}, body = order dispatch payload with `token`, `code`, `customer`,
 * `delivery`, `products`, `price`, `payment`, `callbackUrls`), and we report order status
 * to the callback URLs carried inside that payload.
 *
 * NOT verifiable without partner access (NDA): how the middleware authenticates to the plugin,
 * the middleware login endpoint, and the exact reject-reason values. Those parts are marked below.
 */
const crypto = require('crypto');
const axios = require('axios');

const capabilities = { webhook: true, pushStatus: true, syncMenu: false, codSupported: true, polling: false };
const displayInfo = { name: 'Talabat', color: '#FF5A00', badgeClass: 'talabat', icon: '🟠' };

const ALLOWED_CALLBACK_HOSTS = ['restaurant-partners.com', 'talabat.com', 'deliveryhero.com', 'foodpanda.com'];

function safeEqual(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Request authentication (UNVERIFIED: the plugin security spec is behind the partner docs).
 * Accepts, in constant time, any of: Authorization "Bearer <secret>", HTTP Basic whose password is the secret,
 * or an HMAC-SHA256 hex of the raw body in x-talabat-signature. All use the per-branch secret.
 */
function verifyRequest(headers, rawBody, secret) {
    if (!secret) return false;
    const auth = String(headers['authorization'] || '');
    if (/^bearer /i.test(auth)) return safeEqual(auth.slice(7).trim(), secret);
    if (/^basic /i.test(auth)) {
        const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString();
        const pwd = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded;
        return safeEqual(pwd, secret);
    }
    const sig = headers[getSignatureHeader()];
    if (sig) return verifySignature(rawBody, sig, secret);
    return false;
}

function verifySignature(rawBody, signature, secret) {
    if (!signature || !secret) return false;
    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqual(computed, String(signature).toLowerCase());
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Map a Delivery Hero order dispatch payload (field names per the published Order schema). */
function parseOrder(raw) {
    const order = raw.order || raw;
    // Cancellation notices use the same shape with a `status` of cancelled: ignore them here.
    if (order.status && String(order.status).toLowerCase().includes('cancel')) return null;
    if (!order.token) return { providerOrderId: undefined };
    const cust = order.customer || {};
    const addr = (order.delivery && order.delivery.address) || {};
    const price = order.price || {};
    const pay = order.payment || {};
    const addrText = [addr.street, addr.number, addr.building, addr.floor && ('floor ' + addr.floor), addr.flatNumber && ('flat ' + addr.flatNumber), addr.deliveryArea, addr.city, addr.deliveryInstructions]
        .filter(Boolean).join(', ');
    const payType = String(pay.type || '').toLowerCase();
    const isCash = payType.includes('cash') || payType.includes('cod') || (String(pay.status || '').toLowerCase() !== 'paid' && payType !== '' && !payType.includes('paid') && !payType.includes('online') && !payType.includes('card'));
    return {
        providerOrderId: String(order.token),
        customer: {
            name: [cust.firstName, cust.lastName].filter(Boolean).join(' '),
            phone: [cust.mobilePhoneCountryCode, cust.mobilePhone].filter(Boolean).join(' '),
            address: addrText
        },
        items: (order.products || []).map(p => ({
            providerItemId: String(p.remoteCode || p.id || ''),
            name: p.name || '',
            qty: num(p.quantity) || 1,
            price: num(p.unitPrice) || num(p.paidPrice),
            notes: [p.comment, ...(p.selectedToppings || []).map(t => '+ ' + t.name)].filter(Boolean).join('; ')
        })),
        financials: {
            total: num(price.grandTotal),
            vat: num(price.vatTotal),
            currency: (order.localInfo && order.localInfo.currencySymbol) || 'EGP',
            fees: { commission: num(price.comission), service: num(price.serviceFeeTotal), delivery: num(price.deliveryFee) }
        },
        paymentMethod: isCash ? 'cod' : 'online'
    };
}

function mapStatus(s) {
    return { accepted: 'order_accepted', rejected: 'order_rejected', ready: 'order_prepared', picked_up: 'order_picked_up' }[s] || s;
}

function callbackFor(order, status) {
    const cb = (order && order.rawPayload && (order.rawPayload.order || order.rawPayload).callbackUrls) || {};
    const url = { accepted: cb.orderAcceptedUrl, rejected: cb.orderRejectedUrl, ready: cb.orderPreparedUrl, picked_up: cb.orderPickedUpUrl }[status];
    if (!url) return null;
    let u; try { u = new URL(url); } catch (e) { return null; }
    const hostOk = ALLOWED_CALLBACK_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
    return u.protocol === 'https:' && hostOk ? u.toString() : null;
}

/**
 * Report status to the callback URL Delivery Hero sent with the order.
 * Body fields and the bearer token are per the public overview only (UNVERIFIED): accept needs a formatted
 * datetime, reject needs a reason. Skipped (no call) when the order carries no allowed callback URL.
 */
async function pushStatus(providerOrderId, internalStatus, credentials, order) {
    const url = callbackFor(order, internalStatus);
    if (!url) return { skipped: true, reason: 'no callback url for this status' };
    let body = {};
    if (internalStatus === 'accepted') body = { acceptanceTime: new Date(Date.now() + 25 * 60000).toISOString() };
    if (internalStatus === 'rejected') body = { message: 'Restaurant unable to fulfil this order' };
    const headers = { 'Content-Type': 'application/json' };
    if (credentials && credentials.apiKey) headers.Authorization = `Bearer ${credentials.apiKey}`;
    const r = await axios.put(url, body, { headers, timeout: 10000 });
    return r.data;
}

async function syncMenu() { throw new Error('Talabat catalog sync needs the partner Catalog Import spec (not public)'); }
async function testConnection() { return false; }
function getSignatureHeader() { return 'x-talabat-signature'; }

module.exports = { capabilities, displayInfo, verifySignature, verifyRequest, parseOrder, mapStatus, pushStatus, syncMenu, testConnection, getSignatureHeader };
