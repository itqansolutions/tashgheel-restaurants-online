const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'tenants',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    code: {
        type: String,
        uppercase: true,
        required: true
        // Unique per tenant handled by compound index below
    },
    phone: String,
    address: String,
    isActive: {
        type: Boolean,
        default: true
    },
    settings: {
        taxRate: { type: Number, default: 0 },
        currency: { type: String, default: 'EGP' },
        openingHours: { type: Map, of: String }, // e.g., "Mon": "09:00-22:00"
        timezone: { type: String, default: 'Africa/Cairo' }
    }
}, { timestamps: true });

// Prevent duplicate branch codes within the same tenant
branchSchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('data_branches', branchSchema); // Prefixing 'data_' consistent with generic storage or separate?
// Actually, generic storage uses 'data_' prefix for dynamic collections, but dedicated models usually don't.
// Looking at existing codebase, we used generic `Data` model for everything under `config.MONGODB_URI`.
// However, for core SaaS entities like 'tenants', 'users', we should have explicit models if we want Mongoose validation.
// The user has been using `storage.js` which is a wrapper around `mongoose.connection.db` or generic model.
// BUT, to be "SAAS-grade", explicit schemas are better.
// Let's use 'Branch' model.
