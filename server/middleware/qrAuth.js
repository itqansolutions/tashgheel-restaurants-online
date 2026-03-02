/**
 * qrAuth Middleware
 *
 * Accepts two forms of authentication:
 *  1. Standard JWT in HttpOnly cookie → set by login (staff: waiter/cashier)
 *  2. QR session JWT in Authorization: Bearer <token> header → issued by table QR scan (customer)
 *
 * Sets on req: tenantId, branchId, userId, userRole ('staff'|'customer')
 */

const jwt = require('jsonwebtoken');
const Table = require('../models/Table');

module.exports = async function qrAuth(req, res, next) {
    // ─── 1. Try standard staff JWT from cookie ───
    const cookieToken = req.cookies?.token;
    if (cookieToken) {
        try {
            const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
            // Staff JWT payload is nested: { user: { id, tenantId, role, branchIds[], defaultBranchId } }
            const user = decoded.user;
            if (!user) throw new Error('Invalid JWT structure');

            req.tenantId = user.tenantId;
            req.userId = user.id;
            req.user = user;        // Keep req.user for any downstream middleware
            req.userRole = 'staff';

            // branchId is NOT in the JWT — the existing system sends it as x-branch-id header
            // (same as branchScope reads it). We do the same here.
            const headerBranchId = req.header('x-branch-id');
            if (headerBranchId && /^[0-9a-fA-F]{24}$/.test(headerBranchId)) {
                req.branchId = headerBranchId;
            } else {
                // Fallback: user's defaultBranchId for staff who didn't send the header
                req.branchId = user.defaultBranchId || null;
            }

            return next();
        } catch (e) {
            // Cookie token present but invalid — fall through to check Bearer
        }
    }

    // ─── 2. Try QR session JWT from Authorization: Bearer header ───
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const bearerToken = authHeader.slice(7);
        try {
            // Decode without verifying first to extract tableId (we need it to get qrSecret)
            const unverified = jwt.decode(bearerToken);
            if (!unverified || !unverified.tableId || unverified.role !== 'customer') {
                return res.status(401).json({ error: 'Invalid QR token' });
            }

            // Fetch the table to get its per-table qrSecret
            const table = await Table.findById(unverified.tableId).lean();
            if (!table || !table.qrSecret) {
                return res.status(401).json({ error: 'Table not found or QR not configured' });
            }

            // Now verify with the per-table secret
            const decoded = jwt.verify(bearerToken, table.qrSecret);

            req.tenantId = decoded.tenantId;
            req.branchId = decoded.branchId;
            req.tableId = decoded.tableId;   // Convenience — already validated
            req.userId = 'customer';
            req.userRole = 'customer';
            return next();

        } catch (e) {
            if (e.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'QR session expired. Please scan the QR code again.' });
            }
            return res.status(401).json({ error: 'Invalid QR token' });
        }
    }

    // ─── 3. No auth found ───
    return res.status(401).json({ error: 'Authentication required' });
};
