const express = require('express');
const router = express.Router();
const {readCatalog,snapshotItems}=require('../utils/catalog');
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
                tenantId: true,
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
            select: { id: true, name: true, fee: true, branchId: true, coordinates: true }
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

        const branch = await prisma.branch.findFirst({ 
            where: { id: branchId, isActive: true } 
        });
        if (!branch) return res.status(404).json({ error: 'Branch not found or inactive' });

        const tenantId = branch.tenantId;

        // Fetch Categories
        let categoriesRaw = await storage.readData('categories', tenantId);
        let categories = [];
        try { categories = JSON.parse(categoriesRaw || '[]'); } catch (e) { }
        categories = categories.filter(c => c && c.isActive !== false).sort((a, b) => (a.order || 0) - (b.order || 0)).map(c => typeof c==='string' ? {name:c} : {id:c.id,name:c.name,order:c.order,isActive:c.isActive});

        // Fetch Products
        let productsRaw = await storage.readData('spare_parts', tenantId);
        if (!productsRaw || productsRaw === '[]') {
            productsRaw = await storage.readData('products', tenantId);
        }
        let products = [];
        try { products = JSON.parse(productsRaw || '[]'); } catch (e) { }

        // Build a map of all products so we can resolve add-on details
        const productMap = new Map(products.map(p => [String(p.id), p]));

        products = products.filter(p => p.isActive !== false)
            .map(p => ({
                id: p.id,
                name: p.name,
                nameAr: p.nameAr,
                description: p.description,
                price: p.price,
                category: p.category,
                image: p.image,
                taxRate: p.taxRate,
                hasSizes: !!p.hasSizes,
                sizes: Array.isArray(p.sizes) ? p.sizes.map(size=>({id:size.id,name:size.name,price:size.price,isActive:size.isActive})) : [],
                isService: !!p.isService,
                allowAllAddons: !!p.allowAllAddons,
                allowedAddons: Array.isArray(p.allowedAddons)
                    ? p.allowedAddons.map(addonId => {
                        const addon = productMap.get(String(addonId));
                        return addon ? { id: String(addonId), name: addon.name, price: addon.price || 0 } : null;
                    }).filter(Boolean)
                    : []
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

        const products=await readCatalog(prisma,tenantId);
        const selected=snapshotItems(cart,products);
        let subtotal=0;
        const validItems=selected.map(item=>{
            const product=products.find(p=>String(p.id)===String(item.id));
            const size=product.hasSizes?(product.sizes||[]).find(s=>String(s.id)===String(item.sizeId)||(item.sizeName&&s.name===item.sizeName)):null;
            let price=Number(size?.price ?? product.price ?? 0);
            for(const addon of item.addons||[]) {const p=products.find(p=>String(p.id)===String(addon.id));price+=Number(p.price||0)*Number(addon.qty??1);}
            if(!Number.isFinite(price)||price<0) throw new Error('Invalid catalog price');
            subtotal+=price*Number(item.qty);
            return {id:require('crypto').randomUUID(),productId:String(product.id),productCode:product.partNumber||product.code,name:product.name,qty:Number(item.qty),price,cost:item.cost,note:item.note||''};
        });
        const settings = branch.settings || {};
        const taxRate = settings.taxRate || 0;
        const taxAmount = subtotal * (taxRate / 100);

        let deliveryFee = 0;
        if (orderType === 'delivery') {
            if (deliveryZoneId) {
                const zone = await prisma.deliveryZone.findUnique({ where: { id: deliveryZoneId,tenantId,branchId } });
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
                    _stockSelections: selected.map((i,index)=>({saleItemId:validItems[index].id,productId:String(i.id),sizeId:i.sizeId,sizeName:i.sizeName,addons:(i.addons||[]).map(a=>({id:String(a.id),qty:Number(a.qty??1)}))})),
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
