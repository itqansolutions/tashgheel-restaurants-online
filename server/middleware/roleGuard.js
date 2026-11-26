/**
 * Server-side role guard. Runs after auth. The UI hides pages by role, but the API
 * used to accept every call from any logged-in user (a cashier could create branches,
 * delete suppliers or overwrite settings). This blocks the sensitive writes.
 *
 *  - Counter roles (cashier, waiter, salesman, chef, kitchen, technician): no back-office writes.
 *  - Branch create/edit/delete and user delete: admin only.
 *  - Only an admin may create or edit an admin account.
 * Selling, kitchen, table and customer flows are not touched.
 */
const COUNTER = new Set(['cashier', 'waiter', 'salesman', 'chef', 'kitchen', 'technician']);
const PROTECTED_KEYS = /^(users|shop_roles|shop_settings|vendors|vendor_transactions.*|vendor_payments|employees|payroll.*|emp_.*|attendance|license.*|session)$/i;

const forbid = (res) => res.status(403).json({ msg: 'Not authorized for this action', error: 'FORBIDDEN_ROLE' });

module.exports = function roleGuard(req, res, next) {
    const role = String(req.user?.role || '');
    if (role === 'SUPER_ADMIN') return next();
    const method = req.method.toUpperCase();
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (!write) return next();
    const path = (req.baseUrl + req.path).replace(/\/+$/, '');
    const isAdmin = role === 'admin';
    const low = COUNTER.has(role.toLowerCase());

    // Admin only
    if (!isAdmin && (/^\/api\/branches(\/|$)/.test(path))) return forbid(res);
    if (!isAdmin && method === 'DELETE' && /^\/api\/users(\/|$)/.test(path)) return forbid(res);

    // Only an admin may create or change an admin account
    if (!isAdmin && /^\/api\/users(\/|$)/.test(path)) {
        if (String(req.body?.role || '').toLowerCase() === 'admin') return forbid(res);
        // PUT on an existing admin is checked in the route (needs the stored role)
        req.guardNoAdminEdit = true;
    }

    if (low) {
        if (/^\/api\/(taxes|expenses|delivery-zones|users|parties\/vendors)(\/|$)/.test(path)) return forbid(res);
        if (/^\/api\/(inventory\/(material|restock|set|adjust|transfer)|products\/save)(\/|$)/.test(path)) return forbid(res);
        if (/^\/api\/data\/(save|delete|remove-item)/.test(path)) {
            const key = req.body?.key || decodeURIComponent(path.split('/').pop() || '');
            if (PROTECTED_KEYS.test(String(key))) return forbid(res);
        }
    }
    next();
};
