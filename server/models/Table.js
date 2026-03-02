const mongoose = require('mongoose');
const crypto = require('crypto');

const tableSchema = new mongoose.Schema({
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
    name: {
        type: String,
        required: true,
        trim: true   // e.g. "Table 5"
    },
    code: {
        type: String,
        required: true,
        uppercase: true,
        trim: true   // Short code for QR URL e.g. "T5"
    },
    capacity: {
        type: Number,
        default: 4
    },
    status: {
        type: String,
        enum: ['available', 'occupied'],
        default: 'available'
    },
    activeOrderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null
    },
    // Per-table HMAC secret used to sign/verify QR session tokens.
    // Generated automatically on create. Rotatable on demand.
    qrSecret: {
        type: String,
        default: () => crypto.randomBytes(32).toString('hex')
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Soft-delete: set true instead of hard-deleting so historical receipts + audit trail are preserved
    isArchived: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });


// Prevent duplicate codes within same branch
tableSchema.index({ tenantId: 1, branchId: 1 });
tableSchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Table', tableSchema);
