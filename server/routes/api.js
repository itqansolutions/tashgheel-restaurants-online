const express = require('express');
const router = express.Router();
const storage = require('../utils/storage');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// === Data Storage Endpoints ===

// Save Data (Replace `saveData` command)
router.post('/data/save', async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Key is required' });

    try {
        await storage.saveData(key, value, req.tenantId);
        res.json({ success: true });
    } catch (err) {
        console.error(`Error saving ${key}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Read Data (Replace `readData` command)
router.get('/data/read/:key', async (req, res) => {
    const { key } = req.params;
    try {
        const data = await storage.readData(key, req.tenantId);
        res.send(data || '');
    } catch (err) {
        console.error(`Error reading ${key}:`, err);
        res.status(500).send('');
    }
});

// List Data Files (Replace `listDataFiles` command)
router.get('/data/list', async (req, res) => {
    try {
        const files = await storage.listDataFiles();
        // Filtering list by tenantId prefix
        const tenantPrefix = req.tenantId ? `${req.tenantId}_` : '';
        const filtered = files
            .filter(f => f.startsWith(tenantPrefix))
            .map(f => f.replace(tenantPrefix, ''));
        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check File Exists (Replace `checkFileExists` command)
router.post('/file/exists', async (req, res) => {
    const { folderPath, filename } = req.body;
    const exists = await storage.checkFileExists(filename, req.tenantId);
    res.json(exists);
});

// === Machine ID Endpoint (REMOVED: Managed by Super Admin) ===

// === Utilities ===
router.post('/utils/ensure-data-dir', async (req, res) => {
    await storage.ensureDataDir();
    res.json(true);
});

module.exports = router;
