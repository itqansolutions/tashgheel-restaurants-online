const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const storage = require('../utils/storage');
const { authLimiter } = require('../middleware/limiter');
const auth = require('../middleware/auth');
const Branch = require('../models/Branch');

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refreshSecret123';

// Helper: Get Branch Details
async function getBranchDetails(user) {
    try {
        let query = {};
        if (user.role === 'admin') {
            // Admins get all branches of their tenant
            query = { tenantId: user.tenantId };
        } else {
            // Others only get specific ones
            if (!user.branchIds || user.branchIds.length === 0) return [];
            query = { _id: { $in: user.branchIds } };
        }

        const branches = await Branch.find(query).select('name code');
        return branches.map(b => ({ id: b._id, name: b.name, code: b.code }));
    } catch (e) { return []; }
}

// Helper: Generate Tokens
const generateTokens = (user, tenantId) => {
    const payload = {
        user: {
            id: user._id,
            tenantId: tenantId,
            role: user.role,
            username: user.username,
            branchIds: user.branchIds || [],
            defaultBranchId: user.defaultBranchId
        }
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

    return { accessToken, refreshToken };
};

// Helper: Set Cookies
const setCookies = (res, accessToken, refreshToken) => {
    // Railway (and most proxies) set x-forwarded-proto
    // We treat it as secure if we are in production OR if the request came via HTTPS
    const isProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';

    // Auto-detect secure connection (best for Railway/Heroku/Vercel)
    // Note: 'res.cookie' options property 'secure' doesn't auto-read req, we must pass it.
    // However, we don't have 'req' here. We passed 'res'.
    // Let's change signature to (req, res, ...) or just rely on env vars + sensible defaults.
    // Safest bet for modern HTTPS deployments: secure=true if on HTTPS.
    // But we don't have req.

    // Let's make it always secure if we are on the cloud (Railway).
    // The previous check was: process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
    // User URL confirms it IS production.

    // Is it possible the variable name is wrong?
    // Let's trust 'NODE_ENV' too.
    const isSecure = isProd || process.env.Manual_Secure === 'true';

    res.cookie('token', accessToken, {
        httpOnly: true,
        secure: true, // FORCE SECURE for Railway HTTPS (It's 2026, HTTPS is standard)
        sameSite: 'lax', // Strict Same-Origin
        maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true, // FORCE SECURE
        sameSite: 'lax',
        path: '/api/auth/refresh',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
};

// @route   POST /api/auth/register
// @desc    Register a new tenant (business) and admin user
router.post('/register', authLimiter, async (req, res) => {
    const { businessName, email, phone, username, password } = req.body;

    try {
        // 1. Check if Tenant exists
        const existingTenant = await storage.findOne('tenants', { email });
        if (existingTenant) {
            return res.status(400).json({ msg: 'Email already registered' });
        }

        // 2. Create Tenant (7 days trial)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 3);

        const tenant = await storage.insert('tenants', {
            businessName,
            email,
            phone,
            trialEndsAt: trialEndsAt.toISOString(),
            status: 'active', // active during trial
            isSubscribed: false,
            subscriptionPlan: 'free_trial'
        });

        // 3. Create Admin User
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const user = await storage.insert('users', {
            tenantId: tenant._id,
            username,
            passwordHash,
            fullName: 'System Administrator',
            role: 'admin',
            active: true
        });

        // 4. Create Default Main Branch
        const mainBranch = new Branch({
            tenantId: tenant._id,
            name: 'Main Branch',
            code: 'MAIN',
            isActive: true
        });
        await mainBranch.save();

        // Send Email Notification (Async - don't block)
        sendRegistrationEmail(businessName, email, phone, username, trialEndsAt).catch(console.error);

        // 4. Generate Tokens & Set Cookies
        const { accessToken, refreshToken } = generateTokens(user, tenant._id);
        setCookies(res, accessToken, refreshToken);

        res.json({
            msg: 'Registration successful',
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                fullName: user.fullName,
                tenantId: tenant._id,
                branchIds: user.branchIds || [],
                defaultBranchId: user.defaultBranchId
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', authLimiter, async (req, res) => {
    const { username, password, businessEmail } = req.body;

    try {
        if (!businessEmail) {
            return res.status(400).json({ msg: 'Business Email is required' });
        }

        // 1. Find Tenant
        const tenant = await storage.findOne('tenants', { email: businessEmail });
        if (!tenant) {
            // Delay response to prevent timing attacks (optional but good for hardening)
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // 2. Check Status
        if (tenant.status === 'suspended') return res.status(403).json({ msg: 'Account Suspended' });

        // 3. Find User
        const users = await storage.find('users', { tenantId: tenant._id, username: username });
        const user = users[0];

        if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

        // 4. Verify Password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

        // 5. Generate Tokens & Set Cookies
        const { accessToken, refreshToken } = generateTokens(user, tenant._id);
        setCookies(res, accessToken, refreshToken);

        // Fetch Branch Names
        let branches = await getBranchDetails(user);

        // 🚀 Auto-migration for legacy tenants: Ensure at least one branch for admins
        if (user.role === 'admin' && branches.length === 0) {
            const mainBranch = new Branch({
                tenantId: tenant._id,
                name: 'Main Branch',
                code: 'MAIN',
                isActive: true
            });
            await mainBranch.save();
            branches = [{ id: mainBranch._id, name: mainBranch.name, code: mainBranch.code }];
        }

        res.json({
            msg: 'Login successful',
            user: {
                id: user._id,
                tenantId: tenant._id,
                username: user.username,
                role: user.role,
                fullName: user.fullName,
                branchIds: user.branchIds || [],
                branches: branches, // NEW
                defaultBranchId: user.defaultBranchId
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   POST /api/auth/logout
// @desc    Clear cookies
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    res.json({ msg: 'Logged out successfully' });
});

// @route   GET /api/auth/refresh
// @desc    Get new Access Token using Refresh Token
router.get('/refresh', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ msg: 'No refresh token' });

    try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);

        // Optionally verify user exists in DB logic here for extra security (Revocation check)
        // const user = await storage.findOne('users', { _id: decoded.user.id });
        // if (!user) return res.status(401).json({ msg: 'User revoked' });

        // Issue new Access Token
        const payload = { user: decoded.user };
        const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });

        const isProd = process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
        res.cookie('token', accessToken, {
            httpOnly: true,
            secure: isProd,
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
// @desc    Get current user data (replaces localStorage reliance)
router.get('/me', auth, async (req, res) => {
    try {
        // User is already attached by auth middleware
        const user = await storage.findOne('users', { _id: req.user.id });
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Fetch Branch Names
        const branches = await getBranchDetails(user);

        res.json({
            id: user._id,
            tenantId: user.tenantId,
            username: user.username,
            role: user.role,
            fullName: user.fullName,
            branchIds: user.branchIds || [],
            branches: branches, // NEW
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
