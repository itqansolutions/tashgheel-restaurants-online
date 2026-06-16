const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { authLimiter } = require('../middleware/limiter');
const auth = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refreshSecret123';

// Helper: Get Branch Details
async function getBranchDetails(user) {
    try {
        let branches;
        if (user.role === 'admin') {
            // Admins get all branches of their tenant
            branches = await prisma.branch.findMany({
                where: { tenantId: user.tenantId },
                select: { id: true, name: true, code: true }
            });
        } else {
            // Others only get specific ones
            // In Prisma, we use the relations setup in the schema
            const dbUser = await prisma.user.findUnique({
                where: { id: user.id },
                include: { branches: { select: { id: true, name: true, code: true } } }
            });
            branches = dbUser ? dbUser.branches : [];
        }
        return branches.map(b => ({ id: b.id, name: b.name, code: b.code }));
    } catch (e) { return []; }
}

const generateTokens = (user, tenantId) => {
    const payload = {
        user: {
            id: user.id,
            tenantId: tenantId,
            role: user.role,
            username: user.username,
            branchIds: user.branches ? user.branches.map(b => b.id) : [],
            defaultBranchId: user.defaultBranchId
        }
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

    return { accessToken, refreshToken };
};

// ... setCookies stays the same ...
const setCookies = (res, accessToken, refreshToken) => {
    const isProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
    const isSecure = isProd || process.env.Manual_Secure === 'true';

    res.cookie('token', accessToken, {
        httpOnly: true,
        secure: true, 
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000 
    });

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/auth/refresh',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
};

// @route   POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
    const { businessName, email, phone, username, password } = req.body;

    try {
        const existingTenant = await prisma.tenant.findUnique({ where: { email } });
        if (existingTenant) {
            return res.status(400).json({ msg: 'Email already registered' });
        }

        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 3);

        // Transaction to ensure atomic registration
        const result = await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: {
                    businessName,
                    email,
                    phone,
                    trialEndsAt,
                    status: 'active',
                    isSubscribed: false,
                    subscriptionPlan: 'free_trial'
                }
            });

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            const user = await tx.user.create({
                data: {
                    tenantId: tenant.id,
                    username,
                    passwordHash,
                    fullName: 'System Administrator',
                    role: 'admin',
                    active: true
                }
            });

            const mainBranch = await tx.branch.create({
                data: {
                    tenantId: tenant.id,
                    name: 'Main Branch',
                    code: 'MAIN',
                    isActive: true
                }
            });

            return { tenant, user, mainBranch };
        });

        const { tenant, user } = result;

        sendRegistrationEmail(businessName, email, phone, username, trialEndsAt).catch(console.error);

        const { accessToken, refreshToken } = generateTokens(user, tenant.id);
        setCookies(res, accessToken, refreshToken);

        res.json({
            msg: 'Registration successful',
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                fullName: user.fullName,
                tenantId: tenant.id,
                defaultBranchId: user.defaultBranchId
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
    const { username, password, businessEmail } = req.body;

    try {
        if (!businessEmail) {
            return res.status(400).json({ msg: 'Business Email is required' });
        }

        const tenant = await prisma.tenant.findUnique({ where: { email: businessEmail } });
        if (!tenant) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        if (tenant.status !== 'active') {
            return res.status(403).json({ msg: 'Account is not active. Please contact support.' });
        }

        const now = new Date();
        let expiryDate = tenant.trialEndsAt;
        if (tenant.isSubscribed && tenant.subscriptionEndsAt) {
            expiryDate = tenant.subscriptionEndsAt;
        }

        if (expiryDate < now) {
            return res.status(403).json({ msg: 'Subscription or Trial has expired. Please renew to continue.' });
        }

        const user = await prisma.user.findFirst({
            where: { tenantId: tenant.id, username },
            include: { branches: true }
        });

        if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

        const { accessToken, refreshToken } = generateTokens(user, tenant.id);
        setCookies(res, accessToken, refreshToken);

        await prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() }
        });

        let branches = await getBranchDetails(user);

        // Auto-migration check: Ensure at least one branch for admins
        if (user.role === 'admin' && branches.length === 0) {
            const mainBranch = await prisma.branch.create({
                data: {
                    tenantId: tenant.id,
                    name: 'Main Branch',
                    code: 'MAIN',
                    isActive: true
                }
            });
            branches = [{ id: mainBranch.id, name: mainBranch.name, code: mainBranch.code }];
        }

        res.json({
            msg: 'Login successful',
            user: {
                id: user.id,
                tenantId: tenant.id,
                username: user.username,
                role: user.role,
                fullName: user.fullName,
                branches: branches,
                defaultBranchId: user.defaultBranchId
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    res.json({ msg: 'Logged out successfully' });
});

// @route   GET /api/auth/refresh
router.get('/refresh', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ msg: 'No refresh token' });

    try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);

        const payload = { user: decoded.user };
        const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });

        const isProd = process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
        res.cookie('token', accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 15 * 60 * 1000
        });

        res.json({ msg: 'Token refreshed' });

    } catch (err) {
        console.error('Refresh Error', err);
        return res.status(403).json({ msg: 'Invalid refresh token' });
    }
});

// @route   GET /api/auth/me
router.get('/me', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const branches = await getBranchDetails(user);

        res.json({
            id: user.id,
            tenantId: user.tenantId,
            username: user.username,
            role: user.role,
            fullName: user.fullName,
            branches: branches,
            defaultBranchId: user.defaultBranchId
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Helper for Email
async function sendRegistrationEmail(businessName, email, phone, username, trialEndsAt) {
    try {
        const nodemailer = require('nodemailer');
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
            });
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: 'info@itqansolutions.org',
                subject: `New Resturant Registration: ${businessName}`,
                text: `Business: ${businessName}\nEmail: ${email}\nPhone: ${phone}\nAdmin: ${username}`
            });
        }
    } catch (e) { console.error('Email error', e); }
}

module.exports = router;
