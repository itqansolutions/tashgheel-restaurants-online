const Branch = require('../models/Branch');

module.exports = async function (req, res, next) {
    // 1. Get Branch ID from Header
    const branchId = req.header('x-branch-id');

    // 🚀 SYSTEM BYPASS: Foundation routes don't need branch context
    const bypassRoutes = [
        '/api/utils/ensure-data-dir',
        '/api/file/exists',
        '/api/data/list'
    ];
    if (bypassRoutes.includes(req.originalUrl.split('?')[0])) {
        return next();
    }

    // 2. Check for missing or invalid header (literal "null" or "undefined" strings)
    if (!branchId || branchId === 'null' || branchId === 'undefined' || branchId === '') {
        return res.status(400).json({ error: 'BRANCH_REQUIRED', msg: 'Branch Selection Required' });
    }

    // 3. Validate ObjectId Format (Strict check)
    if (!/^[0-9a-fA-F]{24}$/.test(branchId)) {
        return res.status(400).json({ error: 'INVALID_BRANCH', msg: 'Invalid Branch ID format' });
    }

    try {
        // 3. Super Admin Bypass
        if (req.user.role === 'SUPER_ADMIN') {
            req.branchId = branchId; // Trust the header
            return next();
        }

        // 4. Validate Branch Access for Regular Users
        // a. Admin Bypass: Admins can access any branch within their tenant
        if (req.user.role === 'admin') {
            req.branchId = branchId;
            return next();
        }

        // b. Check if user has specific branch access
        if (!req.user.branchIds || !req.user.branchIds.includes(branchId)) {
            // Also allow if it matches defaultBranchId just in case
            if (req.user.defaultBranchId && req.user.defaultBranchId.toString() === branchId) {
                // Allowed
            } else {
                console.warn(`Forbidden: User ${req.user.username} (role: ${req.user.role}) attempted to access branch ${branchId}`);
                return res.status(403).json({ msg: 'Access Denied to this Branch' });
            }
        }

        // 5. Attach to Request
        req.branchId = branchId;
        next();

    } catch (err) {
        console.error('Branch Scope Error:', err);
        res.status(500).json({ msg: 'Server Error in Branch Scope' });
    }
};
