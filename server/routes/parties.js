const express = require('express');
const router = express.Router();
const { getTenantDB } = require('../utils/storage');
// Note: We don't have Mongoose models for Vendors/Customers yet in this plan, 
// but we need to read/write them. 
// Options:
// 1. Create Models (Best)
// 2. Read from JSON/File (Legacy) -> BUT we want to migrate to DB.
// Let's create Schemas on the fly or improved generic handler?
// Given constraints, I will create simple Mongoose models for them to ensure migration.

const mongoose = require('mongoose');

// --- SCHEMAS ---
const vendorSchema = new mongoose.Schema({
    name: String,
    mobile: String,
    address: String,
    credit: { type: Number, default: 0 },
    tenantId: String,
    branchId: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date
});

const customerSchema = new mongoose.Schema({
    name: String,
    mobile: String,
    address: String,
    notes: String,
    loyaltyPoints: { type: Number, default: 0 },
    tenantId: String,
    branchId: String, // Global or Branch Specific? Usually Global per Tenant.
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date
});

// Helper to get Models safely
// They might be defined elsewhere, but if not:
const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);


// --- VENDORS ROUTES ---
router.get('/vendors', async (req, res) => {
    try {
        const { tenantId } = req;
        const vendors = await Vendor.find({ tenantId });
        res.json(vendors);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/vendors', async (req, res) => {
    try {
        const { tenantId, branchId } = req;
        const data = req.body;

        let vendor;
        if (data._id || data.id) {
            vendor = await Vendor.findOneAndUpdate(
                { _id: data._id || data.id, tenantId },
                { ...data, updatedAt: new Date() },
                { new: true, upsert: true } // Upsert for migration
            );
        } else {
            vendor = new Vendor({ ...data, tenantId, branchId });
            await vendor.save();
        }
        res.json(vendor);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/vendors/:id', async (req, res) => {
    try {
        await Vendor.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- CUSTOMERS ROUTES ---
router.get('/customers', async (req, res) => {
    try {
        const { tenantId } = req;
        const customers = await Customer.find({ tenantId });
        res.json(customers);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/customers', async (req, res) => {
    try {
        const { tenantId, branchId } = req;
        const data = req.body;

        let customer;
        // Search by ID or Mobile to prevent dupes?
        // Prioritize ID if update
        if (data._id || data.id) {
            customer = await Customer.findOneAndUpdate(
                { _id: data._id || data.id, tenantId },
                { ...data, updatedAt: new Date() },
                { new: true, upsert: true }
            );
        } else {
            // New
            customer = new Customer({ ...data, tenantId, branchId });
            await customer.save();
        }
        res.json(customer);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/customers/:id', async (req, res) => {
    try {
        await Customer.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
