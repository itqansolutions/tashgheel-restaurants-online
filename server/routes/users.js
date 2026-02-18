const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const storage = require('../utils/storage');
const auth = require('../middleware/auth'); // Ensure user is authenticated

// @route   GET /api/users
// @desc    Get all users for tenant
router.get('/', async (req, res) => {
    try {
        const users = await storage.find('users', { tenantId: req.tenantId });

        // Return without passwordHash
        const safeUsers = users.map(u => ({
            id: u._id,
            username: u.username,
            fullName: u.fullName,
            role: u.role,
            active: u.active,
            lastLogin: u.lastLogin,
            branchIds: u.branchIds || [],
            defaultBranchId: u.defaultBranchId,
            allowedPages: u.allowedPages || []
        }));

        res.json(safeUsers);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   POST /api/users
// @desc    Add a new user
router.post('/', async (req, res) => {
    // Only Admin/Manager can add users
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        return res.status(403).json({ msg: 'Not authorized' });
    }

    const { username, password, fullName, role, branchIds, defaultBranchId, allowedPages } = req.body;

    if (!username || !password || !fullName || !role) {
        return res.status(400).json({ msg: 'Please enter all fields' });
    }

    try {
        // Check duplicate
        const existing = await storage.findOne('users', { tenantId: req.tenantId, username });
        if (existing) {
            return res.status(400).json({ msg: 'Username already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = {
            tenantId: req.tenantId,
            username,
            passwordHash,
            fullName,
            role,
            branchIds: branchIds || [],
            defaultBranchId: defaultBranchId || null,
            allowedPages: allowedPages || [],
            active: true,
            createdAt: new Date(),
            createdBy: req.user.id
        };

        const user = await storage.insert('users', newUser);

        // Return safe user
        res.json({
            id: user._id,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            active: user.active
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   PUT /api/users/:id
// @desc    Update user
router.put('/:id', async (req, res) => {
    // Only Admin can edit users (or manager editing cashier?)
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        return res.status(403).json({ msg: 'Not authorized' });
    }

    const { username, password, fullName, role, branchIds, defaultBranchId, allowedPages } = req.body;

    try {
        const user = await storage.findOne('users', { _id: req.params.id, tenantId: req.tenantId });
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Update fields
        if (username) user.username = username;
        if (fullName) user.fullName = fullName;
        if (role) user.role = role;
        if (branchIds) user.branchIds = branchIds;
        if (defaultBranchId) user.defaultBranchId = defaultBranchId;
        if (allowedPages) user.allowedPages = allowedPages;

        // Update password if provided
        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.passwordHash = await bcrypt.hash(password, salt);
        }

        await storage.update('users', req.params.id, user);

        res.json({ msg: 'User updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   DELETE /api/users/:id
// @desc    Delete user
router.delete('/:id', async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Not authorized' });
    }
    try {
        // Prevent deleting self?
        if (req.params.id === req.user.id) {
            return res.status(400).json({ msg: 'Cannot delete yourself' });
        }

        // Check if user exists and belongs to tenant
        const user = await storage.findOne('users', { _id: req.params.id, tenantId: req.tenantId });
        if (!user) return res.status(404).json({ msg: 'User not found' });

        await storage.remove('users', req.params.id);
        res.json({ msg: 'User removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;
