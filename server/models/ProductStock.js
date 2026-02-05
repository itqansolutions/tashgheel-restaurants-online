const mongoose = require('mongoose');

const productStockSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'tenants',
        required: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'branches',
        required: true
    },
    productId: {
        type: String, // Changed from ObjectId to String to support legacy integer IDs
        required: true
    },
    qty: {
        type: Number,
        default: 0
    },
    minStock: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Ensure unique stock entry per product per branch
productStockSchema.index({ tenantId: 1, branchId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('product_stocks', productStockSchema);
