const express = require('express');
const router = express.Router();
/**
 * Tables Router
 *
 * CRUD for restaurant tables + QR session token generation.
 * All routes require staff JWT (via auth middleware registered in index.js).
 * Exception: GET /by-code is public (rate-limited) — used by customer QR page.
 */

const prisma = require('../prisma');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// Rate limit for QR session endpoint (public)
const qrLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 60,
    message: { error: 'Too many requests. Please try again later.' }
});

// GET /api/tables
router.get('/', async (req, res) => {
    try {
        const tables = await prisma.table.findMany({
            where: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                isActive: true
            }
        });

        const activeOrderIds = tables.filter(t => t.activeOrderId).map(t => t.activeOrderId);
        
        let orderMap = {};
        if (activeOrderIds.length > 0) {
            const activeOrders = await prisma.order.findMany({
                where: { id: { in: activeOrderIds }, status: 'open' },
                include: { items: true }
            });

            activeOrders.forEach(o => {
                orderMap[o.id] = {
                    itemCount: o.items.length,
                    pendingCount: o.items.filter(i => i.kitchenStatus === 'pending').length,
                    sentCount: o.items.filter(i => i.kitchenStatus === 'sent').length,
                    requestedBillAt: o.requestedBillAt,
                    isLocked: o.isLocked
                };
            });
        }

        const result = tables.map(t => ({
            ...t,
            orderSummary: t.activeOrderId ? (orderMap[t.activeOrderId] || null) : null
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/tables/by-code 
router.get('/by-code', qrLimiter, async (req, res) => {
    try {
        const { code, branch } = req.query;
        if (!code || !branch) return res.status(400).json({ error: 'code and branch are required' });

        const table = await prisma.table.findFirst({
            where: {
                code: code.toUpperCase(),
                branchId: branch,
                isActive: true
            }
        });

        if (!table) return res.status(404).json({ error: 'Table not found' });

        const token = jwt.sign(
            {
                tableId: table.id,
                branchId: table.branchId,
                tenantId: table.tenantId,
                role: 'customer',
                nonce: crypto.randomBytes(8).toString('hex')
            },
            table.qrSecret,
            { expiresIn: '4h' }
        );

        res.json({
            token,
            tableId: table.id,
            tableName: table.name,
            branchId: table.branchId,
            activeOrderId: table.activeOrderId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tables
router.post('/', async (req, res) => {
    try {
        const { name, code, capacity } = req.body;
        if (!name || !code) return res.status(400).json({ error: 'name and code are required' });

        const table = await prisma.table.create({
            data: {
                tenantId: req.tenantId,
                branchId: req.branchId,
                name: name.trim(),
                code: code.toUpperCase().trim(),
                capacity: parseInt(capacity) || 4,
                qrSecret: crypto.randomBytes(32).toString('hex')
            }
        });

        res.status(201).json({ success: true, table });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'A table with this code already exists in this branch.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/tables/:id
router.put('/:id', async (req, res) => {
    try {
        const { name, capacity, isActive } = req.body;
        
        await prisma.table.update({
            where: { id: req.params.id },
            data: {
                name: name ? name.trim() : undefined,
                capacity: capacity !== undefined ? parseInt(capacity) : undefined,
                isActive: isActive !== undefined ? isActive : undefined
            }
        });

        const updatedTable = await prisma.table.findUnique({ where: { id: req.params.id } });
        res.json({ success: true, table: updatedTable });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/tables/:id
router.delete('/:id', async (req, res) => {
    try {
        const table = await prisma.table.findUnique({ where: { id: req.params.id } });
        if (!table || table.tenantId !== req.tenantId || table.branchId !== req.branchId) {
            return res.status(404).json({ error: 'Table not found' });
        }

        if (table.activeOrderId) {
            const activeOrder = await prisma.order.findFirst({
                where: { id: table.activeOrderId, status: 'open' }
            });
            if (activeOrder) {
                return res.status(409).json({
                    error: 'This table has an active order. Close the bill first before removing the table.'
                });
            }
        }

        await prisma.table.update({
            where: { id: req.params.id },
            data: { isActive: false, isArchived: true }
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tables/:id/rotate-qr
router.post('/:id/rotate-qr', async (req, res) => {
    try {
        await prisma.table.update({
            where: { id: req.params.id },
            data: { qrSecret: crypto.randomBytes(32).toString('hex') }
        });
        res.json({ success: true, message: 'QR secret rotated. Previous QR codes are now invalid.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
