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
        await storage.saveData(key, value);
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
        const data = await storage.readData(key);
        res.send(data || ''); // Return raw string (or JSON string) as Tauri did
    } catch (err) {
        console.error(`Error reading ${key}:`, err);
        res.status(500).send('');
    }
});

// List Data Files (Replace `listDataFiles` command)
router.get('/data/list', async (req, res) => {
    try {
        const files = await storage.listDataFiles();
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check File Exists (Replace `checkFileExists` command)
router.post('/file/exists', async (req, res) => {
    const { folderPath, filename } = req.body;
    // Note: In Web version, we strictly control paths. 
    // We'll interpret 'folderPath' loosely or ignore it if it's just local data.
    // For backup logic, we might need a specific 'backups' folder.

    // For safety, let's assume this only checks within permitted areas or data dir for now.
    // If the original app used absolute paths for backups, we can't fully support that in browser 
    // without user interaction, but here we are in a server context.

    // Simplification: Check in data dir + filename
    const exists = await storage.checkFileExists(filename); // naive implementation
    res.json(exists);
});

// === Machine ID Endpoint ===
router.get('/machine-id', async (req, res) => {
    // Persistent machine ID logic
    try {
        let machineId = await storage.readData('machine_id');
        // storage.readData returns raw string content
        if (!machineId) {
            machineId = crypto.randomUUID();
            await storage.saveData('machine_id', machineId);
        }
        res.send(machineId);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// === Utilities ===
router.post('/utils/ensure-data-dir', async (req, res) => {
    await storage.ensureDataDir();
    res.json(true);
});

module.exports = router;
