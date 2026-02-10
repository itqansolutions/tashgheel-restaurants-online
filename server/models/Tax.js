const mongoose = require('mongoose');

const TaxSchema = new mongoose.Schema({
    name: { type: String, required: true },
    percentage: { type: Number, required: true },
    enabled: { type: Boolean, default: true },
    branchId: { type: String, default: null }, // Optional: Link to specific branch
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tax', TaxSchema);
