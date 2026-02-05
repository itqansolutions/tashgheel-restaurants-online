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

// @route   GET /api/super-admin/tenants
// @desc    Get all tenants
router.get('/tenants', checkSuperAdmin, async (req, res) => {
    try {
        const tenants = await storage.find('tenants');
        // Sort by createdAt desc
        tenants.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(tenants);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
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
        res.status(500).send('Server Error');
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
        res.status(500).send('Server Error');
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
        res.status(500).send('Server Error');
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
        res.status(500).send('Server Error');
    }
});

module.exports = router;
