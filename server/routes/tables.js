/**
 * Tables Router
 *
 * CRUD for restaurant tables + QR session token generation.
 * All routes require staff JWT (via auth middleware registered in index.js).
 * Exception: GET /by-code is public (rate-limited) — used by customer QR page.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Table = require('../models/Table');
const Order = require('../models/Order');
const rateLimit = require('express-rate-limit');

// Rate limit for QR session endpoint (public)
const qrLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60,
    message: { error: 'Too many requests. Please try again later.' }
});

// ─── GET /api/tables ─── List all tables for this branch ───
router.get('/', async (req, res) => {
    try {
        const tables = await Table.find({
            tenantId: req.tenantId,
            branchId: req.branchId,
            isActive: true
        }).lean();

        // Attach item counts from active orders for dashboard badges
        const occupiedTableIds = tables
            .filter(t => t.activeOrderId)
            .map(t => t.activeOrderId);

        let orderMap = {};
        if (occupiedTableIds.length > 0) {
            const activeOrders = await Order.find({
                _id: { $in: occupiedTableIds },
                status: 'open'
            }).select('_id items.kitchenStatus requestedBillAt isLocked').lean();

            activeOrders.forEach(o => {
                orderMap[o._id.toString()] = {
                    itemCount: o.items ? o.items.length : 0,
                    pendingCount: o.items ? o.items.filter(i => i.kitchenStatus === 'pending').length : 0,
                    sentCount: o.items ? o.items.filter(i => i.kitchenStatus === 'sent').length : 0,
                    requestedBillAt: o.requestedBillAt,
                    isLocked: o.isLocked
                };
            });
        }

        const result = tables.map(t => ({
            ...t,
            orderSummary: t.activeOrderId ? (orderMap[t.activeOrderId.toString()] || null) : null
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/tables/by-code ─── Public: resolve table + issue QR session JWT ───
router.get('/by-code', qrLimiter, async (req, res) => {
    try {
        const { code, branch } = req.query;
        if (!code || !branch) {
            return res.status(400).json({ error: 'code and branch are required' });
        }

        const table = await Table.findOne({
            code: code.toUpperCase(),
            branchId: branch,
            isActive: true
        }).lean();

        if (!table) {
            return res.status(404).json({ error: 'Table not found' });
        }

        // Generate QR session JWT signed with per-table secret
        const crypto = require('crypto');
        const token = jwt.sign(
            {
                tableId: table._id.toString(),
                branchId: table.branchId.toString(),
                tenantId: table.tenantId.toString(),
                role: 'customer',
                nonce: crypto.randomBytes(8).toString('hex') // Prevents replay attacks
            },
            table.qrSecret,
            { expiresIn: '4h' }
        );

        res.json({
            token,
            tableId: table._id,
            tableName: table.name,
            branchId: table.branchId,
            activeOrderId: table.activeOrderId || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/tables ─── Create a table ───
router.post('/', async (req, res) => {
    try {
        const { name, code, capacity } = req.body;
        if (!name || !code) {
            return res.status(400).json({ error: 'name and code are required' });
        }

        const table = new Table({
            tenantId: req.tenantId,
            branchId: req.branchId,
            name: name.trim(),
            code: code.toUpperCase().trim(),
            capacity: capacity || 4
        });

        await table.save();
        res.status(201).json({ success: true, table });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'A table with this code already exists in this branch.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /api/tables/:id ─── Update table details ───
router.put('/:id', async (req, res) => {
    try {
        const { name, capacity, isActive } = req.body;
        const update = {};
        if (name) update.name = name.trim();
        if (capacity !== undefined) update.capacity = capacity;
        if (isActive !== undefined) update.isActive = isActive;

        const table = await Table.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId, branchId: req.branchId },
            update,
            { new: true }
        );

        if (!table) return res.status(404).json({ error: 'Table not found' });
        res.json({ success: true, table });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /api/tables/:id ─── Soft-delete table — blocked if order open ───
router.delete('/:id', async (req, res) => {
    try {
        const table = await Table.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            branchId: req.branchId
        });

        if (!table) return res.status(404).json({ error: 'Table not found' });

        // Guard: cannot archive if active order exists
        if (table.activeOrderId) {
            const activeOrder = await Order.exists({ _id: table.activeOrderId, status: 'open' });
            if (activeOrder) {
                return res.status(409).json({
                    error: 'This table has an active order. Close the bill first before removing the table.'
                });
            }
        }

        // Soft-delete: preserves historical Sale records and audit trail
        await Table.updateOne(
            { _id: req.params.id },
            { isActive: false, isArchived: true }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ─── POST /api/tables/:id/rotate-qr ─── Rotate the QR secret (invalidates all existing QR sessions) ───
router.post('/:id/rotate-qr', async (req, res) => {
    try {
        const crypto = require('crypto');
        const table = await Table.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId, branchId: req.branchId },
            { qrSecret: crypto.randomBytes(32).toString('hex') },
            { new: true }
        );
        if (!table) return res.status(404).json({ error: 'Table not found' });
        res.json({ success: true, message: 'QR secret rotated. Previous QR codes are now invalid.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
