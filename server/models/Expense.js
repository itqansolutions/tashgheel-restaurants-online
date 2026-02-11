const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    seller: { type: String, default: '' }, // Vendor or Payee
    category: { type: String, default: 'General' },
    method: { type: String, default: 'cash', enum: ['cash', 'card', 'bank', 'other'] },
    type: { type: String, default: 'expense' }, // 'expense' or 'vendor_payment'
    notes: { type: String },

    // Multi-tenancy & Auditing
    tenantId: { type: String, required: true },
    branchId: { type: String, required: true },
    createdBy: { type: String }, // User ID or Name
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Expense', expenseSchema);
