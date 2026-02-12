const mongoose = require('mongoose');

const deliveryZoneSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'tenants',
        required: true,
        index: true
    },
    // Optional: if zones are specific to a branch
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'branches',
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    fee: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Optional: For advanced polygon/geo-fencing in future
    // coordinates: [[Number]] 
}, { timestamps: true });

// Prevent duplicate names within same tenant/branch
deliveryZoneSchema.index({ tenantId: 1, branchId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('DeliveryZone', deliveryZoneSchema);
