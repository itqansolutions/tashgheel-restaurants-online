const mongoose = require('mongoose');

// ─── Unified Internal Status Enum ───
const AGGREGATOR_STATUSES = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    PREPARING: 'preparing',
    READY: 'ready',
    DELIVERED: 'delivered',
    REJECTED: 'rejected',
    MAPPING_FAILED: 'mapping_failed'
};

const PROVIDERS = ['talabat', 'uber_eats', 'careem_now', 'mrsool'];

// ─── Status History (Audit Trail) ───
const statusHistorySchema = new mongoose.Schema({
    status: { type: String, enum: Object.values(AGGREGATOR_STATUSES) },
    at: { type: Date, default: Date.now },
    note: String
}, { _id: false });

// ─── Order Items ───
const aggregatorItemSchema = new mongoose.Schema({
    providerItemId: String,
    name: String,
    qty: Number,
    price: Number,
    notes: String
}, { _id: false });

// ─── Financials ───
const financialsSchema = new mongoose.Schema({
    total: { type: Number, required: true },
    vat: { type: Number, default: 0 },
    currency: { type: String, default: 'EGP' },
    fees: {
        commission: { type: Number, default: 0 },
        service: { type: Number, default: 0 },
        delivery: { type: Number, default: 0 }
    }
}, { _id: false });

// ─── Main Schema ───
const aggregatorOrderSchema = new mongoose.Schema({
    // Provider identification
    provider: {
        type: String,
        enum: PROVIDERS,
        required: true,
        index: true
    },
    providerOrderId: {
        type: String,
        required: true
    },

    // Tenant & Branch
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'tenants',
        required: true,
        index: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'branches',
        required: true,
        index: true
    },

    // Status lifecycle
    status: {
        type: String,
        enum: Object.values(AGGREGATOR_STATUSES),
        default: AGGREGATOR_STATUSES.PENDING,
        index: true
    },
    statusHistory: [statusHistorySchema],

    // Raw payload (audit / reprocessing / disputes)
    rawPayload: { type: mongoose.Schema.Types.Mixed },

    // Cross-reference to Sale after mapping
    mappedSaleId: String,

    // Customer
    customer: {
        name: String,
        phone: String,
        address: String
    },

    // Items
    items: [aggregatorItemSchema],

    // Financials
    financials: financialsSchema,

    // Payment
    paymentMethod: {
        type: String,
        enum: ['online', 'cod'],
        default: 'online'
    },

    // Retry / error handling
    retryCount: { type: Number, default: 0 },
    lastError: String

}, { timestamps: true });

// ─── Composite Idempotency Index ───
aggregatorOrderSchema.index(
    { provider: 1, providerOrderId: 1 },
    { unique: true }
);

// ─── Query Performance Indices ───
aggregatorOrderSchema.index({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 });
aggregatorOrderSchema.index({ tenantId: 1, branchId: 1, provider: 1, createdAt: -1 });

// ─── Helper: Append Status History ───
aggregatorOrderSchema.methods.transitionTo = function (newStatus, note) {
    this.status = newStatus;
    this.statusHistory.push({ status: newStatus, at: new Date(), note });
};

module.exports = mongoose.model('AggregatorOrder', aggregatorOrderSchema);
module.exports.AGGREGATOR_STATUSES = AGGREGATOR_STATUSES;
module.exports.PROVIDERS = PROVIDERS;
