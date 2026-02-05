const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const storage = require('../utils/storage');

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

// @route   POST /api/auth/register
// @desc    Register a new tenant (business) and admin user
router.post('/register', async (req, res) => {
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

        // Send Email Notification
        try {
            const nodemailer = require('nodemailer');
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    }
                });

                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: 'info@itqansolutions.org',
                    subject: `New Resturant Registration: ${businessName}`,
                    text: `
=== NEW BUSINESS REGISTRATION ===
Business: ${businessName}
Email: ${email}
Phone: ${phone}
Admin: ${username}
Registered: ${new Date().toLocaleString()}
Trial Ends: ${trialEndsAt.toLocaleString()}
==================================
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log('Registration email sent to info@itqansolutions.org');
            }
        } catch (emailError) {
            console.error('Failed to send email:', emailError);
        }

        // 4. Return Token
        const payload = {
            user: {
                id: user._id,
                tenantId: tenant._id,
                role: user.role,
                username: user.username
            }
        };

        jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' }, (err, token) => {
            if (err) throw err;
            res.json({
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    role: user.role,
                    fullName: user.fullName,
                    tenantId: tenant._id
                }
            });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
    const { username, password, businessEmail } = req.body;

    try {
        if (!businessEmail) {
            return res.status(400).json({ msg: 'Business Email is required' });
        }

        // 1. Find Tenant
        const tenant = await storage.findOne('tenants', { email: businessEmail });
        if (!tenant) {
            return res.status(400).json({ msg: 'Business not found' });
        }

        // 2. Check Tenant Status (Activation Logic)
        if (tenant.status === 'on_hold') {
            return res.status(403).json({ msg: 'Account is Temporarily On Hold. Contact Support.' });
        }
        if (tenant.status === 'suspended') {
            return res.status(403).json({ msg: 'Account Suspended.' });
        }

        // Check Expiry (Simple check)
        // If trial ended AND not subscribed => Suspended? 
        // Or just warn? Retail app logic seemed soft on this in the snippet, 
        // but let's implement a check.
        const now = new Date();
        const trialEnd = new Date(tenant.trialEndsAt);
        const subEnd = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt) : null;

        let isActive = false;
        if (now < trialEnd) isActive = true;
        if (subEnd && now < subEnd) isActive = true;

        if (!isActive) {
            // Use "on_hold" as graceful expiry
            // Allow login but maybe UI restricts features? 
            // For now, let's BLOCK login to enforce payment, as requested "Activation" logic.
            return res.status(403).json({ msg: 'Subscription/Trial Expired. Please contact support.' });
        }

        // 3. Find User
        // Note: storage.findOne performs exact match. 
        // We need to match tenantId AND username.
        const users = await storage.find('users', { tenantId: tenant._id, username: username });
        const user = users[0]; // Assuming unique username per tenant enforced by app logic

        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // 4. Verify Password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // 5. Return Token
        const payload = {
            user: {
                id: user._id,
                tenantId: tenant._id,
                role: user.role,
                username: user.username
            }
        };

        jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' }, (err, token) => {
            if (err) throw err;
            res.json({
                token,
                user: {
                    id: user._id,
                    tenantId: tenant._id,
                    username: user.username,
                    role: user.role,
                    fullName: user.fullName
                }
            });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
