require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes/api');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
    origin: true, // Allow all origins for now (or specific if needed)
    credentials: true, // Important for Cookies!
    allowedHeaders: ['Content-Type', 'Authorization', 'x-branch-id']
}));
// 🚀 Explicitly handle OPTIONS for all routes (Preflight Safeguard)
app.options('*', cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-branch-id']
}));

// 🔐 Aggregator Webhook: Raw body for HMAC signature verification (MUST be before JSON parser)
app.use('/api/aggregator/:provider/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 🛡️ Extra Safety: Explicitly Allow Headers (Fixes Proxy/Preflight strippings)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-branch-id");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    next();
});

// Connect to PostgreSQL (Prisma)
const prisma = require('./prisma');

console.log('🔍 Environment Check:');
console.log('- Active Railway Environment:', process.env.RAILWAY_ENVIRONMENT_NAME || 'Unknown');
console.log('- Keys present:', Object.keys(process.env).filter(k => !k.startsWith('npm_')).join(', '));
console.log('- DATABASE_URL present:', !!process.env.DATABASE_URL);

async function startServer() {
    try {
        await prisma.$connect();
        console.log('✅ PostgreSQL (Prisma) Connected');

        // Start background jobs
        require('./jobs/orderCleanup');
    } catch (err) {
        console.error('❌ Database Connection Error:', err.message);
        // In production, you might want to retry or exit
    }
}

startServer();

const auth = require('./middleware/auth');
const branchScope = require('./middleware/branchScope');

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/super-admin', require('./routes/super-admin'));
app.use('/api/taxes', auth, require('./routes/taxes')); // 🆕 Tax Management
app.use('/api/expenses', auth, branchScope, require('./routes/expenses')); // 🆕 Expenses Management
app.use('/api/parties', auth, require('./routes/parties')); // 🆕 Vendors & Customers
app.use('/api/branches', auth, require('./routes/branches')); // 🆕 Branch Management
app.use('/api/delivery-zones', auth, require('./routes/delivery-zones')); // 🆕 Delivery Zones Management
app.use('/api/users', auth, require('./routes/users')); // 🆕 User Management

// 🌍 Public Store API (Rate Limited, No Auth Required for Read)
app.use('/api/public', require('./routes/public-api'));

// Aggregator Hub — webhook uses raw body for HMAC, other routes use auth+branchScope inside router
app.use('/api/aggregator', require('./aggregators/aggregatorRouter'));

// 🪑 Dine-In System
const qrAuth = require('./middleware/qrAuth');
// Note: qrAuth already validates the JWT (staff or customer QR) and sets req.tenantId + req.branchId
// directly from the token payload — branchScope is NOT used here because:
//   1. Customer QR tokens don't send x-branch-id header
//   2. req.user is undefined for customer tokens, which crashes branchScope
app.use('/api/tables', auth, branchScope, require('./routes/tables'));             // Table management (staff only)
app.use('/api/orders', qrAuth, require('./routes/orders'));                        // Orders (staff + customer QR) — auth handled by qrAuth
app.use('/api/dine-in/kitchen', auth, branchScope, require('./routes/kitchen-orders')); // Kitchen display (staff only)

app.use('/api', auth, branchScope, apiRoutes);

// Serve Static Files (Frontend)
// Serve from the parent directory (project root)
app.use(express.static(path.join(__dirname, '../')));

// Serve index.html for root explicitly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

// Fallback to index.html for SPA routing

app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on port ${PORT} [v2]`);
});

module.exports = app;
