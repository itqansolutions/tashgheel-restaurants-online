const prisma = require('../prisma');
const bcrypt = require('bcryptjs');

// Hardcoded Super Admin Credentials
const SUPER_ADMIN_USER = 'tashgheel';
const SUPER_ADMIN_PASS = 'BuFF@li2025#';

// Middleware to check super admin session
const checkSuperAdmin = (req, res, next) => {
    const secret = req.header('x-super-admin-secret');
    if (secret === 'super_secret_key_123') {
        next();
    } else {
        res.status(401).json({ msg: 'Unauthorized' });
    }
};

// @route   POST /api/super-admin/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === SUPER_ADMIN_USER && password === SUPER_ADMIN_PASS) {
        res.json({ secret: 'super_secret_key_123' });
    } else {
        res.status(400).json({ msg: 'Invalid Credentials' });
    }
});

// @route   POST /api/super-admin/tenants
router.post('/tenants', checkSuperAdmin, async (req, res) => {
    try {
        const { businessName, email, phone, plan, username, password } = req.body;

        const existingTenant = await prisma.tenant.findUnique({ where: { email } });
        if (existingTenant) {
            return res.status(400).json({ msg: 'Business email already exists' });
        }

        const trialDays = plan === 'monthly' ? 30 : (plan === 'yearly' ? 365 : 14);
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const result = await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: {
                    businessName,
                    email,
                    phone,
                    trialEndsAt,
                    status: 'active',
                    subscriptionPlan: plan || 'free_trial',
                    isSubscribed: plan !== 'free_trial',
                    subscriptionStartedAt: plan !== 'free_trial' ? new Date() : null,
                    settings: { taxRate: 15, taxName: 'VAT' }
                }
            });

            await tx.user.create({
                data: {
                    tenantId: tenant.id,
                    username,
                    passwordHash,
                    role: 'admin',
                    fullName: 'Admin',
                    active: true
                }
            });

            return tenant;
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error: ' + err.message });
    }
});

// @route   GET /api/super-admin/tenants
router.get('/tenants', checkSuperAdmin, async (req, res) => {
    try {
        const tenants = await prisma.tenant.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const enhancedTenants = await Promise.all(tenants.map(async (tenant) => {
            const stats = {
                usersCount: await prisma.user.count({ where: { tenantId: tenant.id } }),
                employeesCount: await prisma.user.count({
                    where: {
                        tenantId: tenant.id,
                        role: { in: ['cashier', 'manager', 'salesman', 'chef'] }
                    }
                })
            };

            const lastActiveUser = await prisma.user.findFirst({
                where: { tenantId: tenant.id },
                orderBy: { lastLogin: 'desc' },
                select: { lastLogin: true }
            });

            // Average Daily Sales Calculation
            const salesByDay = await prisma.sale.groupBy({
                by: ['date'],
                where: { tenantId: tenant.id, status: 'finished' },
                _sum: { total: true }
            });

            const avgDailySales = salesByDay.length > 0
                ? salesByDay.reduce((acc, curr) => acc + (curr._sum.total || 0), 0) / salesByDay.length
                : 0;

            return {
                ...tenant,
                lastActive: lastActiveUser ? lastActiveUser.lastLogin : null,
                usersCount: stats.usersCount,
                employeesCount: stats.employeesCount,
                avgDailySales
            };
        }));

        res.json(enhancedTenants);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error: ' + err.message });
    }
});

// @route   PUT /api/super-admin/tenants/:id
router.put('/tenants/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { businessName, email, phone, plan } = req.body;

        const tenant = await prisma.tenant.update({
            where: { id: req.params.id },
            data: {
                businessName,
                email,
                phone,
                subscriptionPlan: plan,
                isSubscribed: plan ? plan !== 'free_trial' : undefined
            }
        });

        res.json(tenant);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   PUT /api/super-admin/tenants/:id/status
router.put('/tenants/:id/status', checkSuperAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const tenant = await prisma.tenant.update({
            where: { id: req.params.id },
            data: { status }
        });
        res.json(tenant);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   PUT /api/super-admin/tenants/:id/subscription
router.put('/tenants/:id/subscription', checkSuperAdmin, async (req, res) => {
    try {
        const { months } = req.body;
        const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });

        if (!tenant) return res.status(404).json({ msg: 'Tenant not found' });

        let currentEnd = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt) : new Date();
        const now = new Date();
        if (currentEnd < now) currentEnd = now;

        const newEnd = new Date(currentEnd);
        newEnd.setDate(newEnd.getDate() + (parseInt(months) * 30));

        const updated = await prisma.tenant.update({
            where: { id: req.params.id },
            data: {
                subscriptionEndsAt: newEnd,
                isSubscribed: true,
                status: 'active',
                subscriptionStartedAt: (!tenant.subscriptionStartedAt || tenant.subscriptionEndsAt < now) ? now : undefined
            }
        });

        res.json(updated);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   DELETE /api/super-admin/tenants/:id
router.delete('/tenants/:id', checkSuperAdmin, async (req, res) => {
    try {
        const tenantId = req.params.id;

        // Atomic cascade deletion (using Prisma relations if defined with onDelete: Cascade, 
        // but here we do it manually to be safe or because some aren't cascaded)
        await prisma.$transaction([
            prisma.user.deleteMany({ where: { tenantId } }),
            prisma.table.deleteMany({ where: { tenantId } }),
            prisma.order.deleteMany({ where: { tenantId } }),
            prisma.sale.deleteMany({ where: { tenantId } }),
            prisma.productStock.deleteMany({ where: { tenantId } }),
            prisma.inventoryAdjustment.deleteMany({ where: { tenantId } }),
            prisma.expense.deleteMany({ where: { tenantId } }),
            prisma.dailySummary.deleteMany({ where: { tenantId } }),
            prisma.deliveryZone.deleteMany({ where: { tenantId } }),
            prisma.aggregatorOrder.deleteMany({ where: { tenantId } }),
            prisma.tenant.delete({ where: { id: tenantId } })
        ]);

        res.json({ msg: 'Tenant terminated successfully' });
    } catch (err) {
        res.status(500).json({ msg: 'Server Error: ' + err.message });
    }
});

// @route   PUT /api/super-admin/tenants/:id/password
router.put('/tenants/:id/password', checkSuperAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ msg: 'Password must be at least 6 characters' });
        }

        const admin = await prisma.user.findFirst({
            where: { tenantId: req.params.id, role: 'admin' }
        });

        if (!admin) return res.status(404).json({ msg: 'Admin user not found for this tenant' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: admin.id },
            data: { passwordHash }
        });

        res.json({ msg: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;

module.exports = router;
