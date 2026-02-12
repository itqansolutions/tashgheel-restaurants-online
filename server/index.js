require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
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

// Connect to MongoDB
// Connect to MongoDB
const envUri = process.env.MONGO_URI || '';
const mongoUri = envUri.trim().replace(/[\r\n"']/g, ''); // Remove newlines AND quotes

console.log('🔍 Environment Check:');
console.log('- Active Railway Environment:', process.env.RAILWAY_ENVIRONMENT_NAME || 'Unknown');
console.log('- Keys present:', Object.keys(process.env).filter(k => !k.startsWith('npm_')).join(', '));
console.log('- MONGO_URI present:', !!process.env.MONGO_URI);
console.log('- MONGO_URI length:', envUri.length);

if (!mongoUri) {
    console.error('❌ CRITICAL ERROR: MONGO_URI is missing or empty.');
    console.error('   Please verify the variable is set in Railway settings.');
    // Do not attempt connect to avoid crash, but app will be broken
} else {
    console.log('Attempting to connect to MongoDB...');
    mongoose.connect(mongoUri)
        .then(() => console.log('✅ MongoDB Connected'))
        .catch(err => {
            console.error('❌ MongoDB Connection Error:', err.message);
        });
}

const auth = require('./middleware/auth');
const branchScope = require('./middleware/branchScope');

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/super-admin', require('./routes/super-admin'));
app.use('/api/taxes', require('./routes/taxes')); // 🆕 Tax Management
app.use('/api/expenses', require('./routes/expenses')); // 🆕 Expenses Management
app.use('/api/parties', require('./routes/parties')); // 🆕 Vendors & Customers
app.use('/api/branches', require('./routes/branches')); // 🆕 Branch Management
app.use('/api/delivery-zones', require('./routes/delivery-zones')); // 🆕 Delivery Zones Management

// 🌍 Public Store API (Rate Limited, No Auth Required for Read)
app.use('/api/public', require('./routes/public-api'));

// Aggregator Hub — webhook uses raw body for HMAC, other routes use auth+branchScope inside router
app.use('/api/aggregator', require('./aggregators/aggregatorRouter'));

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
