const mongoose = require('mongoose');

// ─── Item sub-schema (item-level status is the core of the dine-in system) ───
const orderItemSchema = new mongoose.Schema({
    lineId: {
        type: String,
        required: true
        // UUIDv4, generated client-side. Used for targeted PATCH/DELETE by line.
    },
    id: { type: String },          // Product ID
    code: { type: String },        // Product code
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 0.01 },
    price: { type: Number, required: true }, // Snapshot at time of adding
    cost: { type: Number, default: 0 },      // Snapshot for P&L on close
    note: { type: String, default: '' },
    modifiers: [{
        name: String,
        price: { type: Number, default: 0 }
    }],
    addedBy: { type: String, default: 'waiter' }, // userId or 'customer'
    batchNo: { type: Number, default: 0 },         // Which "Send to Kitchen" batch

    // ─── Kitchen lifecycle — ITEM-LEVEL (most critical field) ───
    kitchenStatus: {
        type: String,
        enum: ['pending', 'sent', 'preparing', 'ready', 'cancelled'],
        default: 'pending'
    },

    // ─── Future-proof: waiter approval gate ───
    // To enable: set branch.settings.requireWaiterApproval = true
    // Change default to 'pending-approval' when activating the gate.
    approvalStatus: {
        type: String,
        enum: ['auto-approved', 'pending-approval', 'approved', 'rejected'],
        default: 'auto-approved'
    },

    // Lifecycle timestamps
    sentAt: { type: Date },
    preparingAt: { type: Date },
    readyAt: { type: Date },
    cancelledAt: { type: Date }
}, { _id: false });

// ─── Order schema ───
const orderSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'tenants',
        required: true,
        index: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'data_branches',
        required: true,
        index: true
    },
    tableId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table',
        required: true
    },
    tableName: { type: String },

    status: {
        type: String,
        enum: ['open', 'closed', 'cancelled'],
        default: 'open'
    },

    // ─── Concurrency & Safety ───
    // Set true when cashier opens payment flow — blocks all edits
    isLocked: { type: Boolean, default: false },
    // Optimistic locking: client must send current version with every PATCH
    version: { type: Number, default: 0 },

    // ─── Kitchen Performance Index Field ───
    // true = at least one item is 'sent' or 'preparing'
    // Maintained by recomputeKitchenFlag() — never set manually
    hasActiveKitchenItems: { type: Boolean, default: false },

    // ─── Batch counter ───
    // Incremented on each "Send to Kitchen" call
    currentBatch: { type: Number, default: 0 },

    // ─── Financials (applied at close) ───
    discount: {
        type: { type: String, enum: ['percent', 'value', 'none'], default: 'none' },
        value: { type: Number, default: 0 }
    },

    // ─── Operational metadata ───
    openedBy: { type: String, default: 'waiter' },    // userId or 'customer'
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now }, // Drives inactivity cleanup

    // Set when waiter taps "Request Bill" → kitchen shows 🔔 badge
    requestedBillAt: { type: Date, default: null },

    note: { type: String, default: '' },

    items: [orderItemSchema],

    // Set after successful close → cross-reference to Sale
    mappedSaleId: { type: String, default: null }

}, { timestamps: true });

// ─── Indexes ───
orderSchema.index({ tenantId: 1, branchId: 1, status: 1 });
orderSchema.index({ tenantId: 1, branchId: 1, tableId: 1, status: 1 });
// Kitchen query: fast scan using computed flag
orderSchema.index({ branchId: 1, hasActiveKitchenItems: 1, status: 1 });
// Inactivity cleanup job
orderSchema.index({ status: 1, isLocked: 1, hasActiveKitchenItems: 1, lastActivityAt: 1 });

// ─── Helper: recompute the kitchen flag ───
// MUST be called before order.save() after any item kitchenStatus change.
// Never manually set hasActiveKitchenItems — always use this function.
orderSchema.methods.recomputeKitchenFlag = function () {
    this.hasActiveKitchenItems = this.items.some(i =>
        ['sent', 'preparing'].includes(i.kitchenStatus)
    );
};

module.exports = mongoose.model('Order', orderSchema);
