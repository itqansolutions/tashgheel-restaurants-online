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

// API Routes
app.use('/api', apiRoutes);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/super-admin', require('./routes/super-admin'));

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
