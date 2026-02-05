const jwt = require('jsonwebtoken');
const storage = require('../utils/storage');

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

module.exports = async function (req, res, next) {
    // 1. Check Cookie first
    const token = req.cookies.token || req.header('x-auth-token'); // Fallback to header for testing/legacy

    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.user;
        req.tenantId = decoded.user.tenantId;

        // Check subscription/trial status
        const tenant = await storage.findOne('tenants', { _id: req.tenantId });
        if (!tenant) return res.status(401).json({ msg: 'Tenant not found' });

        const now = new Date();
        const trialEndsAt = new Date(tenant.trialEndsAt);
        // Soft enforce for now
        if (!tenant.isSubscribed && now > trialEndsAt) {
            // console.warn(`Trial expired for tenant ${tenant._id}`);
            // return res.status(403).json({ msg: 'Trial expired', code: 'TRIAL_EXPIRED' });
        }

        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
