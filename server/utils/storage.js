const fs = require('fs').promises;
const path = require('path');
const prisma = require('../prisma');

const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists (for fallback mapping if needed)
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (err) {
        console.error('Error creating data directory:', err);
    }
}

// Get full path for a key (File Mode fallback)
function getFilePath(key, tenantId) {
    if (tenantId) {
        return path.join(DATA_DIR, `${tenantId}_${key}.json`);
    }
    return path.join(DATA_DIR, `${key}.json`);
}

// Low-level: Write data to DB (key-value generic)
async function saveData(key, data, tenantId) {
    let dbSuccess = false;
    let dbError = null;

    try {
        const tid = tenantId || 'global';
        const content = typeof data === 'string' ? data : JSON.stringify(data);
        
        await prisma.data.upsert({
            where: { key_tenantId: { key, tenantId: tid } },
            update: { value: content, updatedAt: new Date() },
            create: { key, tenantId: tid, value: content }
        });
        dbSuccess = true;
    } catch (err) {
        dbError = err;
        console.error('Prisma SaveData Error:', err);
    }

    // File System Fallback
    try {
        await ensureDataDir();
        const filePath = getFilePath(key, tenantId);
        const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        await fs.writeFile(filePath, content, 'utf8');
    } catch (fsErr) {
        console.warn(`Local File Write Failed for ${key}:`, fsErr.message);
        if (dbSuccess) return { success: true };

        const errorMsg = dbError
            ? `Save Failed: DB[${dbError.message}] & File[${fsErr.message}]`
            : fsErr.message;
        throw new Error(errorMsg);
    }
    return { success: true };
}

// Low-level: Read data from DB with File fallback
async function readData(key, tenantId) {
    try {
        const tid = tenantId || 'global';
        const doc = await prisma.data.findUnique({
            where: { key_tenantId: { key, tenantId: tid } }
        });
        if (doc) return typeof doc.value === 'string' ? doc.value : JSON.stringify(doc.value);
    } catch (err) {
        console.error('Prisma ReadData Error:', err);
    }

    // Fallback to reading file
    const filePath = getFilePath(key, tenantId);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data;
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

// List all data keys
async function listDataFiles(tenantId) {
    const keys = new Set();
    const tid = tenantId || 'global';

    try {
        const dataItems = await prisma.data.findMany({
            where: { tenantId: tid },
            select: { key: true }
        });
        dataItems.forEach(d => keys.add(d.key));
    } catch (err) {
        console.error('Prisma listDataFiles Error:', err);
    }

    // Filesystem fallback (strip tenantId prefix if present)
    await ensureDataDir();
    try {
        const files = await fs.readdir(DATA_DIR);
        const prefix = tenantId ? `${tenantId}_` : '';
        files
            .filter(file => file.endsWith('.json'))
            .forEach(file => {
                let name = file.replace('.json', '');
                if (prefix && name.startsWith(prefix)) {
                    name = name.slice(prefix.length);
                }
                keys.add(name);
            });
    } catch (err) { /* ignore */ }

    return Array.from(keys);
}

// Check if file exists
async function checkFileExists(key, tenantId) {
    try {
        const tid = tenantId || 'global';
        const doc = await prisma.data.findUnique({
            where: { key_tenantId: { key, tenantId: tid } }
        });
        if (doc) return true;
    } catch (e) { }

    const filePath = getFilePath(key, tenantId);
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    ensureDataDir,
    saveData,
    readData,
    listDataFiles,
    checkFileExists
};
