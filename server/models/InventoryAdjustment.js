const mongoose = require('mongoose');

const InventoryAdjustmentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    itemId: { type: String, required: true }, // raw material / product id (String matches ProductStock)

    type: {
        type: String,
        enum: ["WASTE", "DAMAGE", "EXPIRED", "AUDIT", "TRANSFER_IN", "TRANSFER_OUT"],
        required: true
    },

    qty: { type: Number, required: true },   // negative for reduction, positive for addition
    unitCost: { type: Number, required: true },
    totalCost: { type: Number, required: true },

    reason: { type: String },
    referenceId: { type: String, index: true }, // For linked transfers (Tx ID)

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('InventoryAdjustment', InventoryAdjustmentSchema);
