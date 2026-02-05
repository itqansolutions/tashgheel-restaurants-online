const mongoose = require('mongoose');

const dailySummarySchema = new mongoose.Schema({
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
    date: {
        type: String, // YYYY-MM-DD
        required: true,
        index: true
    },

    // Aggregated Metrics (Flattened for Mongo Aggregation Performance)
    totalRevenue: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 }, // COGS
    grossProfit: { type: Number, default: 0 },

    voidsCount: { type: Number, default: 0 },
    voidsValue: { type: Number, default: 0 },

    cashTotal: { type: Number, default: 0 },
    cardTotal: { type: Number, default: 0 },
    mobileTotal: { type: Number, default: 0 }

}, { timestamps: true });

// Ensure unique summary per branch per day
dailySummarySchema.index({ tenantId: 1, branchId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailySummary', dailySummarySchema);
