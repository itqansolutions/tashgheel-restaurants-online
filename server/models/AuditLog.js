const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userRole: { type: String },
    action: { type: String, required: true }, // e.g., 'LOGIN', 'SALE_CREATE', 'SALE_REFUND', 'STOCK_UPDATE'
    details: { type: mongoose.Schema.Types.Mixed }, // Flexible payload
    ipAddress: { type: String },
    userAgent: { type: String },
    status: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS' },
    timestamp: { type: Date, default: Date.now, index: true }
}, { expires: '90d' }); // Auto-delete logs after 90 days

module.exports = mongoose.model('AuditLog', auditLogSchema);
