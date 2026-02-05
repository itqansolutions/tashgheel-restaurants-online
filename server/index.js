const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support large data payloads
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
const mongoose = require('mongoose');
require('dotenv').config();

if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('MongoDB Connected'))
        .catch(err => console.error('MongoDB Connection Error:', err));
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Serving static files from ${path.join(__dirname, '../')}`);
});
