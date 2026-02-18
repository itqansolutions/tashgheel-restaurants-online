const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
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
    cashierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true,
        index: true
    },
    // Multi-User Shift Support
    cashiers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    }],

    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },

    openingCash: { type: Number, default: 0 },
    closingCash: { type: Number, default: 0 },
    expectedCash: { type: Number, default: 0 },
    difference: { type: Number, default: 0 },

    status: {
        type: String,
        enum: ['open', 'closed', 'force-closed'],
        default: 'open'
    },

    forcedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    },
    notes: String,

    totals: {
        cashTotal: { type: Number, default: 0 },
        cardTotal: { type: Number, default: 0 },
        mobileTotal: { type: Number, default: 0 },
        totalSales: { type: Number, default: 0 },
        voidsCount: { type: Number, default: 0 },
        voidsValue: { type: Number, default: 0 }
    }

}, { timestamps: true });

// Compound index for optimized shift checks
shiftSchema.index({ tenantId: 1, branchId: 1, cashierId: 1, status: 1 });

module.exports = mongoose.model('Shift', shiftSchema);
