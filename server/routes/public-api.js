const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const storage = require('../utils/storage');
const rateLimit = require('express-rate-limit');

// Rate Limiting
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});

router.use(publicLimiter);

// GET /api/public/branches
router.get('/branches', async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
        if (!tenantId) return res.status(400).json({ error: 'Store ID (Tenant) is required' });

        const branches = await prisma.branch.findMany({
            where: { tenantId, isActive: true },
            select: {
                id: true,
                name: true,
                code: true,
                phone: true,
                address: true,
                settings: true,
                isActive: true
            }
        });

        res.json(branches);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

// GET /api/public/delivery-zones
router.get('/delivery-zones', async (req, res) => {
    try {
        const { branchId } = req.query;
        const filter = { isActive: true };
        if (branchId) filter.branchId = branchId;

        const zones = await prisma.deliveryZone.findMany({
            where: filter,
            select: { id: true, name: true, fee: true, branchId: true }
        });
        res.json(zones);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch delivery zones' });
    }
});

// GET /api/public/menu/:branchId
router.get('/menu/:branchId', async (req, res) => {
    try {
        const { branchId } = req.params;

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const tenantId = branch.tenantId;

        // Fetch Categories
        let categoriesRaw = await storage.readData('categories', tenantId);
        let categories = [];
        try { categories = JSON.parse(categoriesRaw || '[]'); } catch (e) { }
        categories = categories.filter(c => c.isActive !== false).sort((a, b) => (a.order || 0) - (b.order || 0));

        // Fetch Products
        let productsRaw = await storage.readData('spare_parts', tenantId);
        if (!productsRaw || productsRaw === '[]') {
            productsRaw = await storage.readData('products', tenantId);
        }
        let products = [];
        try { products = JSON.parse(productsRaw || '[]'); } catch (e) { }

        products = products.filter(p => p.isActive !== false)
            .map(p => ({
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
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

// POST /api/public/order
router.post('/order', async (req, res) => {
    try {
        const { cart, customer, orderType, branchId, deliveryZoneId } = req.body;

        if (!cart || !Array.isArray(cart) || cart.length === 0) return res.status(400).json({ error: 'Cart is empty' });
        if (!customer || !customer.name || !customer.mobile) return res.status(400).json({ error: 'Customer details required' });
        if (!branchId) return res.status(400).json({ error: 'Branch is required' });

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const tenantId = branch.tenantId;

        // Verify products and prices
        let productsRaw = await storage.readData('spare_parts', tenantId);
        if (!productsRaw || productsRaw === '[]') {
            productsRaw = await storage.readData('products', tenantId);
        }
        let allProducts = [];
        try { allProducts = JSON.parse(productsRaw || '[]'); } catch (e) { }
        const productMap = new Map(allProducts.map(p => [String(p.id), p]));

        let subtotal = 0;
        const validItems = [];

        for (const item of cart) {
            const product = productMap.get(String(item.id));
            if (!product) continue;

            const price = parseFloat(product.price || 0);
            const cost = parseFloat(product.cost || 0);
            const qty = parseFloat(item.qty || 1);
            subtotal += price * qty;

            validItems.push({
                productId: String(product.id),
                productCode: product.partNumber || product.code,
                name: product.name,
                qty: qty,
                price: price,
                cost: cost,
                note: item.note || ''
            });
        }

        const settings = branch.settings || {};
        const taxRate = settings.taxRate || 0;
        const taxAmount = subtotal * (taxRate / 100);

        let deliveryFee = 0;
        if (orderType === 'delivery') {
            if (deliveryZoneId) {
                const zone = await prisma.deliveryZone.findUnique({ where: { id: deliveryZoneId } });
                if (zone) deliveryFee = zone.fee;
            } else if (customer.address && customer.address.area) {
                const zone = await prisma.deliveryZone.findFirst({
                    where: { name: customer.address.area, tenantId, branchId }
                });
                if (zone) deliveryFee = zone.fee;
            }
        }

        const finalTotal = subtotal + taxAmount + deliveryFee;
        const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const sale = await prisma.sale.create({
            data: {
                id: orderId,
                receiptNo: orderId.slice(-6),
                tenantId: tenantId,
                branchId: branchId,
                subtotal: subtotal,
                tax: taxAmount,
                deliveryFee: deliveryFee,
                total: finalTotal,
                orderType: orderType,
                source: 'online_store',
                status: 'pending',
                kitchenStatus: 'pending',
                method: 'cash',
                date: new Date(),
                customer: {
                    name: customer.name,
                    mobile: customer.mobile,
                    address: customer.address ? `${customer.address.area || ''} ${customer.address.street || ''} ${customer.address.building || ''}` : ''
                },
                items: {
                    create: validItems
                }
            }
        });

        res.json({
            success: true,
            orderId: sale.id,
            total: finalTotal,
            message: 'Order placed successfully'
        });

    } catch (err) {
        res.status(500).json({ error: 'Failed to place order: ' + err.message });
    }
});

// GET /api/public/orders
router.get('/orders', async (req, res) => {
    try {
        const { mobile, tenantId } = req.query;
        if (!mobile || !tenantId) return res.status(400).json({ error: 'Mobile and Tenant ID required' });

        const orders = await prisma.sale.findMany({
            where: {
                tenantId: tenantId,
                customer: {
                    path: ['mobile'],
                    equals: mobile
                }
            },
            include: { items: true },
            orderBy: { date: 'desc' },
            take: 20
        });

        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

module.exports = router;

module.exports = router;
