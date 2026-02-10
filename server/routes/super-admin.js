const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const storage = require('../utils/storage');

// Hardcoded Super Admin Credentials
const SUPER_ADMIN_USER = 'tashgheel';
const SUPER_ADMIN_PASS = 'BuFF@li2025#';

// Middleware to check super admin session
const checkSuperAdmin = (req, res, next) => {
    const secret = req.header('x-super-admin-secret');
    if (secret === 'super_secret_key_123') {
        next();
    } else {
        res.status(401).json({ msg: 'Unauthorized' });
    }
};

// @route   POST /api/super-admin/login
// @desc    Super Admin Login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === SUPER_ADMIN_USER && password === SUPER_ADMIN_PASS) {
        res.json({ secret: 'super_secret_key_123' });
    } else {
        res.status(400).json({ msg: 'Invalid Credentials' });
    }
});
// @route   POST /api/super-admin/tenants
// @desc    Create a new Tenant and Admin User
router.post('/tenants', checkSuperAdmin, async (req, res) => {
    try {
        const { businessName, email, phone, plan, username, password } = req.body;
        const User = require('../models/User');

        // Check if tenant email exists
        const existingTenant = (await storage.find('tenants')).find(t => t.email === email);
        if (existingTenant) {
            return res.status(400).json({ msg: 'Business email already exists' });
        }

        // Create Tenant
        const trialDays = plan === 'monthly' ? 30 : (plan === 'yearly' ? 365 : 14);
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

        const newTenant = {
            businessName,
            email,
            phone,
            trialEndsAt: trialEndsAt.toISOString(),
            status: 'active',
            subscriptionPlan: plan || 'free_trial',
            isSubscribed: plan !== 'free_trial',
            createdAt: new Date().toISOString(),
            settings: { taxRate: 15, taxName: 'VAT' }
        };

        const createdTenant = await storage.insert('tenants', newTenant);

        // Create Admin User
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newAdmin = {
            tenantId: createdTenant._id,
            username,
            passwordHash,
            role: 'admin',
            fullName: 'Admin',
            active: true,
            createdAt: new Date().toISOString()
        };

        await storage.insert('users', newAdmin);

        res.json(createdTenant);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});
// @route   GET /api/super-admin/tenants
// @desc    Get all tenants with statistics
router.get('/tenants', checkSuperAdmin, async (req, res) => {
    try {
        const tenants = await storage.find('tenants');
        const User = require('../models/User');
        const Sale = require('../models/Sale');

        // Enhance tenants with stats
        const tenantStatsPromises = tenants.map(async (tenant) => {
            const tenantObj = tenant.toObject ? tenant.toObject() : tenant;

            // 1. User Counts
            const usersCount = await User.countDocuments({ tenantId: tenant._id });
            const employeesCount = await User.countDocuments({
                tenantId: tenant._id,
                role: { $in: ['cashier', 'manager', 'salesman', 'chef'] } // Exclude 'admin'
            });

            // 2. Last Active (Login)
            const lastActiveUser = await User.findOne({ tenantId: tenant._id })
                .sort({ lastLogin: -1 })
                .select('lastLogin');

            tenantObj.lastActive = lastActiveUser ? lastActiveUser.lastLogin : null;
            tenantObj.usersCount = usersCount;
            tenantObj.employeesCount = employeesCount;

            // 3. Average Daily Sales
            // Aggregation: Match Tenant -> Group by DateString -> Avg of DailySums
            const salesStats = await Sale.aggregate([
                {
                    $match: {
                        tenantId: tenant._id,
                        status: 'finished'
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                        dailyTotal: { $sum: "$total" }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgDailySales: { $avg: "$dailyTotal" }
                    }
                }
            ]);

            tenantObj.avgDailySales = salesStats.length > 0 ? salesStats[0].avgDailySales : 0;

            return tenantObj;
        });

        const enhancedTenants = await Promise.all(tenantStatsPromises);

        // Sort by createdAt desc
        enhancedTenants.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(enhancedTenants);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   PUT /api/super-admin/tenants/:id
// @desc    Update tenant details
router.put('/tenants/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { businessName, email, phone, plan } = req.body;

        let updates = { businessName, email, phone };

        if (plan) {
            updates.subscriptionPlan = plan;
            updates.isSubscribed = plan !== 'free_trial';
        }

        const tenant = await storage.update('tenants', req.params.id, updates);
        if (!tenant) return res.status(404).json({ msg: 'Tenant not found' });

        res.json(tenant);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   PUT /api/super-admin/tenants/:id/status
// @desc    Update tenant status (active, on_hold)
router.put('/tenants/:id/status', checkSuperAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const tenant = await storage.update('tenants', req.params.id, { status });
        if (!tenant) return res.status(404).json({ msg: 'Tenant not found' });
        res.json(tenant);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   PUT /api/super-admin/tenants/:id/subscription
// @desc    Extend/Renew subscription
router.put('/tenants/:id/subscription', checkSuperAdmin, async (req, res) => {
    try {
        const { months } = req.body;
        let tenant = (await storage.find('tenants')).find(t => t._id === req.params.id);

        if (!tenant) return res.status(404).json({ msg: 'Tenant not found' });

        let currentEnd = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt) : new Date();
        if (currentEnd < new Date()) currentEnd = new Date();

        const newEnd = new Date(currentEnd);
        newEnd.setMonth(newEnd.getMonth() + parseInt(months));

        const updates = {
            subscriptionEndsAt: newEnd.toISOString(),
            isSubscribed: true,
            status: 'active'
        };

        const updatedTenant = await storage.update('tenants', req.params.id, updates);
        res.json(updatedTenant);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   DELETE /api/super-admin/tenants/:id
// @desc    Terminate tenant (Delete all data)
router.delete('/tenants/:id', checkSuperAdmin, async (req, res) => {
    try {
        const tenantId = req.params.id;

        // Delete Tenant
        await storage.deleteOne('tenants', { _id: tenantId });

        // Delete Users
        await storage.deleteMany('users', { tenantId });

        // Delete other data associated with this tenant if applicable
        // The storage utility handles the underlying storage mechanism
        await storage.deleteMany('inventory', { tenantId });
        await storage.deleteMany('sales', { tenantId });
        await storage.deleteMany('customers', { tenantId });
        await storage.deleteMany('vendors', { tenantId });
        await storage.deleteMany('expenses', { tenantId });

        res.json({ msg: 'Tenant terminated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   PUT /api/super-admin/tenants/:id/password
// @desc    Reset Tenant Admin Password
router.put('/tenants/:id/password', checkSuperAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body;
        const tenantId = req.params.id;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ msg: 'Password must be at least 6 characters' });
        }

        // Find the admin user for this tenant
        const users = await storage.find('users', { tenantId, role: 'admin' });
        const user = users[0];

        if (!user) {
            return res.status(404).json({ msg: 'Admin user not found for this tenant' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        await storage.update('users', user._id, { passwordHash });

        res.json({ msg: 'Password reset successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;
