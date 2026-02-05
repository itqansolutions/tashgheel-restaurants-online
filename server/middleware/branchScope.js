const Branch = require('../models/Branch');

module.exports = async function (req, res, next) {
    // 1. Get Branch ID from Header
    const branchId = req.header('x-branch-id');

    // 2. Check for missing header
    if (!branchId) {
        // If Reporting Mode logic is needed later, we can check req.path here.
        // For now, strict enforcement for operational security.
        return res.status(400).json({ msg: 'Branch Selection Required (x-branch-id header missing)' });
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
