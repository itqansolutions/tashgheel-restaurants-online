const express = require('express');
const router = express.Router();
/**
 * Public QR session endpoint: GET /api/tables/by-code?code=&branch=
 * Mounted BEFORE staff auth (the guest has no login). Rate limited per IP.
 * Issues a short-lived table-scoped token. The owner can switch guest ordering
 * off with shop_settings.qrOrderingEnabled === false.
 */
const prisma = require('../prisma');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { qrOrderingEnabled } = require('../utils/qr-settings');

const qrLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { error: 'Too many requests. Please try again later.' }
});

router.get('/', qrLimiter, async (req, res) => {
    try {
        const code = String(req.query.code || '');
        const branch = String(req.query.branch || '');
        if (!code || !branch) return res.status(400).json({ error: 'code and branch are required' });

        const table = await prisma.table.findFirst({
            where: { code: code.toUpperCase(), branchId: branch, isActive: true, isArchived: false }
        });
        if (!table || !table.qrSecret) return res.status(404).json({ error: 'Table not found' });
        if (!(await qrOrderingEnabled(prisma, table.tenantId))) return res.status(403).json({ error: 'Table ordering is not available at this restaurant' });

        const token = jwt.sign(
            { tableId: table.id, branchId: table.branchId, tenantId: table.tenantId, role: 'customer', nonce: crypto.randomBytes(8).toString('hex') },
            table.qrSecret,
            { expiresIn: '4h' }
        );
        res.json({ token, tableId: table.id, tableName: table.name, branchId: table.branchId, activeOrderId: table.activeOrderId });
    } catch (err) {
        res.status(500).json({ error: 'Could not open the table session' });
    }
});

module.exports = router;
