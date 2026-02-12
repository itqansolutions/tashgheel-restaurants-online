const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Ingredient = require('../models/Ingredient'); // For modifiers/options if needed
const DeliveryZone = require('../models/DeliveryZone');
const Sale = require('../models/Sale');
const Data = require('../models/Data'); // For legacy menu structure if needed
const { getTenantId } = require('../middleware/auth'); // We might need a way to resolve tenant for public requests

// Helper to get Tenant ID from header or default
const resolveTenant = (req) => {
    // For now, assuming single tenant or passed via header 'x-tenant-id' for public
    // In a real multi-tenant SaaS, this would come from the domain/subdomain
    return req.headers['x-tenant-id'] || 'default'; // strict tenant resolution needed for production
};

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
        const branches = await Branch.find({ isActive: true })
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

        // 1. Fetch Categories
        const categories = await Category.find({ isActive: true }).sort('order').lean();

        // 2. Fetch Products
        const products = await Product.find({ isActive: true })
            .select('name nameAr description price category parts image taxRate') // Exclude cost
            .lean();

        // 3. (Optional) Filter by Branch availability if implemented
        // For now, return all global active products

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

        // --- SERVER-SIDE CALCULATION ---
        let subtotal = 0;
        const validItems = [];

        // Fetch all product IDs to verify prices
        const productIds = cart.map(item => item.id);
        const productsParams = await Product.find({ _id: { $in: productIds } }).lean();
        const productMap = new Map(productsParams.map(p => [p._id.toString(), p]));

        for (const item of cart) {
            const product = productMap.get(item.id);
            if (!product) continue; // Skip invalid items

            const price = product.price; // Trust DB price, ignore client price
            const qty = item.qty || 1;
            const lineTotal = price * qty;

            subtotal += lineTotal;

            validItems.push({
                product: product._id,
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
                // This handles the "Migrated Areas" scenario perfectly
                const zone = await DeliveryZone.findOne({ name: customer.address.area });
                if (zone) {
                    deliveryFee = zone.fee;
                    deliveryZoneName = zone.name;
                }
            }
        }

        const finalTotal = subtotal + taxAmount + deliveryFee;

        // Create Sale
        const newSale = new Sale({
            branch: branchId,
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
