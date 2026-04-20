const prisma = require('../prisma');

module.exports = async function (req, res, next) {
    // 1. Get Branch ID from Header
    const branchId = req.header('x-branch-id');

    // ... (bypass logic remains same)

    // 2. Check for missing or invalid header
    if (!branchId || branchId === 'null' || branchId === 'undefined' || branchId === '') {
        return res.status(400).json({ error: 'BRANCH_REQUIRED', msg: 'Branch Selection Required' });
    }

    // 3. Validate UUID Format (Strict check)
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(branchId)) {
        return res.status(400).json({ error: 'INVALID_BRANCH', msg: 'Invalid Branch ID format' });
    }

    try {
        // 4. Verify Branch Exists & Belongs to Tenant (Strict Security)
        const branch = await prisma.branch.findFirst({
            where: { id: branchId, tenantId: req.tenantId }
        });
        if (!branch) {
            const userId = req.user?.id || req.userId || 'unknown';
            console.warn(`Security Alert: Tenant ${req.tenantId} user ${userId} attempted to access invalid/cross-tenant branch ${branchId}`);
            return res.status(404).json({ error: 'BRANCH_NOT_FOUND', msg: 'Branch not found or access denied' });
        }

        // 5. Super Admin Bypass
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
