const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    username: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'cashier', required: true }, // Removed enum to support custom roles
    fullName: { type: String, required: true },
    allowedPages: [{ type: String }], // Granular permissions
    active: { type: Boolean, default: true },
    // Multi-Branch Support
    branchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'data_branches' }],
    defaultBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'data_branches' },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String }
});

// Compound index to ensure unique usernames within a tenant
userSchema.index({ tenantId: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
