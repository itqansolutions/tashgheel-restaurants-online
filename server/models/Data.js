const mongoose = require('mongoose');

const DataSchema = new mongoose.Schema({
    key: { type: String, required: true },
    tenantId: { type: String, default: 'global' },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now }
});

DataSchema.index({ key: 1, tenantId: 1 }, { unique: true });

module.exports = mongoose.model('Data', DataSchema);
