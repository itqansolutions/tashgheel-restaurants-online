const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const DeliveryZone = require('../models/DeliveryZone');
const Sale = require('../models/Sale');
const storage = require('../utils/storage');

// Rate Limiting (Basic in-memory for now, use Redis in production)
const rateLimit = require('express-rate-limit');
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});

router.use(publicLimiter);

// GET /api/public/branches
router.get('/branches', async (req, res) => {
    try {
        // Strict Tenant Resolution
        const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;

        if (!tenantId) {
            return res.status(400).json({ error: 'Store ID (Tenant) is required' });
        }

        const branches = await Branch.find({ isActive: true, tenantId: tenantId })
            .select('name code phone address settings.openingHours settings.taxRate isActive')
            .lean();

        res.json(branches);
    } catch (err) {
        console.error('Public Branches Error:', err);
        res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

// GET /api/public/delivery-zones
router.get('/delivery-zones', async (req, res) => {
    try {
        const { branchId } = req.query;
        const query = { isActive: true };
        if (branchId) query.branchId = branchId;

        const zones = await DeliveryZone.find(query).select('name fee branchId').lean();
        res.json(zones);
    } catch (err) {
        console.error('Public Zones Error:', err);
        res.status(500).json({ error: 'Failed to fetch delivery zones' });
    }
});

// GET /api/public/menu/:branchId
router.get('/menu/:branchId', async (req, res) => {
    try {
        const { branchId } = req.params;

        // 1. Resolve Tenant from Branch
        const branch = await Branch.findById(branchId);
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const tenantId = branch.tenantId;

        // 2. Fetch Categories (JSON)
        let categoriesRaw = await storage.readData('categories', tenantId);
        // Fallback to global if tenant data is missing (Migration/Compatibility)
        if (!categoriesRaw || categoriesRaw === '[]') {
            // Pass null to read 'categories.json' (legacy global)
            categoriesRaw = await storage.readData('categories', null);
        }

        let categories = [];
        try { categories = JSON.parse(categoriesRaw || '[]'); } catch (e) { }

        // Filter active categories and sort
        categories = categories.filter(c => c.isActive !== false).sort((a, b) => (a.order || 0) - (b.order || 0));

        // 3. Fetch Products (JSON)
        // PRIORITIZE 'spare_parts' (Admin Panel Standard)
        let productsRaw = await storage.readData('spare_parts', tenantId);

        // Fallback to 'products' (Legacy/Migration)
        if (!productsRaw || productsRaw === '[]') {
            productsRaw = await storage.readData('products', tenantId);
        }

        // Fallback to global
        if (!productsRaw || productsRaw === '[]') {
            // Pass null to read 'spare_parts.json' (legacy global)
            productsRaw = await storage.readData('spare_parts', null);
        }
        if (!productsRaw || productsRaw === '[]') {
            // Pass null to read 'products.json' (legacy global)
            productsRaw = await storage.readData('products', null);
        }

        let products = [];
        try { products = JSON.parse(productsRaw || '[]'); } catch (e) { }

        // Filter active products
        products = products.filter(p => p.isActive !== false)
            .map(p => ({
                _id: p.id, // Map 'id' to '_id' for frontend consistency if needed, or keep 'id'
                id: p.id,
                name: p.name,
                nameAr: p.nameAr,
                description: p.description,
                price: p.price,
                category: p.category,
                image: p.image,
                taxRate: p.taxRate
            }));

        res.json({ categories, products });
    } catch (err) {
        console.error('Public Menu Error:', err);
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

// POST /api/public/order
router.post('/order', async (req, res) => {
    try {
        const { cart, customer, orderType, branchId, deliveryZoneId } = req.body;

        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }
        if (!customer || !customer.name || !customer.mobile) {
            return res.status(400).json({ error: 'Customer details required' });
        }
        if (!branchId) {
            return res.status(400).json({ error: 'Branch is required' });
        }

        const branch = await Branch.findById(branchId);
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const tenantId = branch.tenantId;

        // --- SERVER-SIDE CALCULATION ---
        let subtotal = 0;
        const validItems = [];

        // Fetch all product IDs to verify prices
        let productsRaw = await storage.readData('spare_parts', tenantId);
        if (!productsRaw || productsRaw === '[]') {
            productsRaw = await storage.readData('products', tenantId);
        }
        if (!productsRaw || productsRaw === '[]') {
            productsRaw = await storage.readData('spare_parts', null);
        }
        if (!productsRaw || productsRaw === '[]') {
            productsRaw = await storage.readData('products', null);
        }

        let allProducts = [];
        try { allProducts = JSON.parse(productsRaw || '[]'); } catch (e) { }

        const productMap = new Map(allProducts.map(p => [String(p.id), p]));

        for (const item of cart) {
            // item.id might be int or string in JSON
            const product = productMap.get(String(item.id));
            if (!product) continue; // Skip invalid items

            const price = parseFloat(product.price || 0);
            const qty = parseFloat(item.qty || 1);
            const lineTotal = price * qty;

            subtotal += lineTotal;

            validItems.push({
                product: product.id, // Store original ID (likely integer or uuid string)
                name: product.name,
                qty: qty,
                price: price,
                total: lineTotal,
                note: item.note || ''
            });
        }

        // Tax
        const taxRate = branch.settings?.taxRate || 0;
        const taxAmount = subtotal * (taxRate / 100);

        // Delivery Fee
        let deliveryFee = 0;
        let deliveryZoneName = '';
        if (orderType === 'delivery') {
            if (deliveryZoneId) {
                const zone = await DeliveryZone.findById(deliveryZoneId);
                if (zone) {
                    deliveryFee = zone.fee;
                    deliveryZoneName = zone.name;
                }
            } else if (customer.address && customer.address.area) {
                // Fallback: try find by name if passed from legacy
                const zone = await DeliveryZone.findOne({ name: customer.address.area });
                if (zone) {
                    deliveryFee = zone.fee;
                    deliveryZoneName = zone.name;
                }
            }
        }

        const finalTotal = subtotal + taxAmount + deliveryFee;

        // Create Sale
        const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newSale = new Sale({
            id: orderId, // REQUIRED by Schema
            receiptNo: orderId.slice(-6), // Short reference
            tenantId: tenantId, // Important for scoping
            branchId: branchId, // Changed from 'branch' to 'branchId' to match schema
            items: validItems,
            subtotal: subtotal,
            tax: taxAmount,
            deliveryFee: deliveryFee,
            total: finalTotal,
            type: orderType, // 'delivery' or 'takeaway'
            source: 'online_store',
            status: 'completed', // Sale is "committed", payment is pending/open
            kitchenStatus: 'pending', // Triggers KDS
            paymentMethod: 'cash', // Default to Pay on Delivery/Pickup for now
            customer: {
                name: customer.name,
                phone: customer.mobile,
                address: customer.address ? `${customer.address.area || ''} ${customer.address.street || ''} ${customer.address.building || ''}` : '',
                area: deliveryZoneName || customer.address?.area
            },
            date: new Date()
        });

        await newSale.save();

        res.json({
            success: true,
            orderId: newSale._id,
            total: finalTotal,
            message: 'Order placed successfully'
        });

    } catch (err) {
        console.error('Order Submit Error:', err);
        res.status(500).json({ error: 'Failed to place order' });
    }
});

module.exports = router;
