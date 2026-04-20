const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const auth = require('../middleware/auth'); // Ensure user is authenticated

// @route   GET /api/users
router.get('/', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            where: { tenantId: req.tenantId },
            include: {
                branches: { select: { id: true } }
            }
        });

        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            fullName: u.fullName,
            role: u.role,
            active: u.active,
            lastLogin: u.lastLogin,
            branchIds: u.branches.map(b => b.id),
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
router.post('/', async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        return res.status(403).json({ msg: 'Not authorized' });
    }

    const { username, password, fullName, role, branchIds, defaultBranchId, allowedPages } = req.body;

    if (!username || !password || !fullName || !role) {
        return res.status(400).json({ msg: 'Please enter all fields' });
    }

    try {
        const existing = await prisma.user.findFirst({
            where: { tenantId: req.tenantId, username }
        });
        if (existing) {
            return res.status(400).json({ msg: 'Username already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                tenantId: req.tenantId,
                username,
                passwordHash,
                fullName,
                role,
                active: true,
                createdBy: req.user.id,
                defaultBranchId: defaultBranchId || null,
                allowedPages: allowedPages || [],
                branches: branchIds ? {
                    connect: branchIds.map(id => ({ id }))
                } : undefined
            }
        });

        res.json({
            id: user.id,
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
router.put('/:id', async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        return res.status(403).json({ msg: 'Not authorized' });
    }

    const { username, password, fullName, role, branchIds, defaultBranchId, allowedPages } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });
        
        if (!user || user.tenantId !== req.tenantId) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const updateData = {};
        if (username) updateData.username = username;
        if (fullName) updateData.fullName = fullName;
        if (role) updateData.role = role;
        if (defaultBranchId !== undefined) updateData.defaultBranchId = defaultBranchId;
        if (allowedPages) updateData.allowedPages = allowedPages;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateData.passwordHash = await bcrypt.hash(password, salt);
        }

        if (branchIds) {
            updateData.branches = {
                set: branchIds.map(id => ({ id }))
            };
        }

        await prisma.user.update({
            where: { id: req.params.id },
            data: updateData
        });

        res.json({ msg: 'User updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Not authorized' });
    }
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ msg: 'Cannot delete yourself' });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });
        
        if (!user || user.tenantId !== req.tenantId) {
            return res.status(404).json({ msg: 'User not found' });
        }

        await prisma.user.delete({
            where: { id: req.params.id }
        });
        
        res.json({ msg: 'User removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;
