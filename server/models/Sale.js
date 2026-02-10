const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
    id: String, // Product ID (String for legacy support)
    name: String,
    qty: Number,
    price: Number,
    cost: Number, // Snapshot of cost at time of sale (CRITICAL for P&L)
    discount: {
        type: { type: String, enum: ['percent', 'value', 'none'], default: 'none' },
        value: { type: Number, default: 0 }
    }
}, { _id: false });

const saleSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        index: true,
        unique: true
    }, // Invoice # (e.g. REC-123)

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
    cashier: { type: String, default: 'Unknown' }, // Name or ID
    salesman: { type: String }, // Waiter/Delivery Man
    shiftId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shift',
        index: true
    },

    total: { type: Number, required: true },
    subtotal: { type: Number },
    discount: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },

    status: {
        type: String,
        enum: ['finished', 'void', 'refunded'],
        default: 'finished'
    },

    method: { type: String, default: 'cash' }, // cash, card, mobile, online
    orderType: { type: String, default: 'take_away' }, // dine_in, delivery, take_away

    // Aggregator Hub fields
    source: { type: String, enum: ['pos', 'talabat', 'uber_eats', 'careem_now', 'mrsool'], default: 'pos' },
    aggregatorOrderId: String, // Cross-reference to AggregatorOrder

    items: [saleItemSchema],

    date: { type: Date, default: Date.now, index: true } // Important for range queries

}, { timestamps: true });

// Compound Indices for Reporting Speed
saleSchema.index({ tenantId: 1, branchId: 1, date: -1 }); // Most common report query
saleSchema.index({ tenantId: 1, branchId: 1, status: 1, date: -1 }); // Filtered by status (Voids/Refunds)
saleSchema.index({ tenantId: 1, date: -1 }); // Global reports

module.exports = mongoose.model('Sale', saleSchema);
