require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

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

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/super-admin', require('./routes/super-admin'));
app.use('/api', auth, apiRoutes);

// Serve Static Files (Frontend)
// Serve from the parent directory (project root)
app.use(express.static(path.join(__dirname, '../')));

// Fallback to index.html for SPA routing (if needed, though this is a multi-page app mostly)
app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on port ${PORT} [v2]`);
});

module.exports = app;
