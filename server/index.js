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
console.log('Attempting to connect to MongoDB...');
if (!process.env.MONGO_URI) {
    console.error('CRITICAL: MONGO_URI is not defined in environment variables!');
}

mongoose.connect(process.env.MONGO_URI || '')
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:');
        console.error(err.message);
    });

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
