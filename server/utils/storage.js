const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
// Models
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Data = require('../models/Data');

const DATA_DIR = path.join(__dirname, '../data');

// Mode Check - Normalize URI as in index.js to prevent "flickering" between file and mongo
const rawUri = process.env.MONGO_URI || '';
const MONGO_URI = rawUri.trim().replace(/[\r\n]/g, '');
const IS_MONGO = !!MONGO_URI;

// Ensure data directory exists (for hybrid or fallback)
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (err) {
        console.error('Error creating data directory:', err);
    }
}

// Connect to MongoDB if URI is present
if (IS_MONGO) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ MongoDB Connected (Storage Logic Active)'))
        .catch(err => console.error('❌ MongoDB Connection Error:', err));
}

// Get full path for a key (File Mode)
function getFilePath(key, tenantId) {
    if (tenantId) {
        return path.join(DATA_DIR, `${tenantId}_${key}.json`);
    }
    return path.join(DATA_DIR, `${key}.json`);
}

// Low-level: Write data to file or Mongo (key-value generic)
// Note: This is for generic unstructured data (like 'settings.json')
// For structured data (Users, Tenants), use the DB Helpers below.
// Low-level: Write data to file or Mongo (key-value generic)
async function saveData(key, data, tenantId) {
    if (IS_MONGO) {
        try {
            const tid = tenantId || 'global';
            await Data.findOneAndUpdate(
                { key, tenantId: tid },
                { value: data, updatedAt: new Date() },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('Mongo SaveData Error:', err);
        }
    }

    await ensureDataDir();
    const filePath = getFilePath(key, tenantId);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
}

// Low-level: Read data from file
async function readData(key, tenantId) {
    if (IS_MONGO) {
        try {
            const tid = tenantId || 'global';
            const doc = await Data.findOne({ key, tenantId: tid });
            if (doc) return typeof doc.value === 'string' ? doc.value : JSON.stringify(doc.value);
        } catch (err) {
            console.error('Mongo ReadData Error:', err);
        }
    }

    const filePath = getFilePath(key, tenantId);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data;
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

// === Database Abstraction Layer (DAL) ===

// Helper to map Collection Name to Mongoose Model
function getModel(collectionName) {
    if (collectionName === 'tenants') return Tenant;
    if (collectionName === 'users') return User;
    // Future: Add Product, Sale, etc. models and return them
    // If no model, fallback to file?
    return null;
}

async function getCollection(collectionName) {
    if (IS_MONGO) {
        const Model = getModel(collectionName);
        if (Model) return await Model.find({});
        // If no model, try file
        const raw = await readData(collectionName);
        return raw ? JSON.parse(raw) : [];
    } else {
        const raw = await readData(collectionName);
        return raw ? JSON.parse(raw) : [];
    }
}

async function saveCollection(collectionName, data) {
    // Only used in file mode helper logic
    await saveData(collectionName, JSON.stringify(data, null, 2));
}

// Find one item matching the query
async function findOne(collectionName, query) {
    if (IS_MONGO) {
        const Model = getModel(collectionName);
        if (Model) {
            // Map 'id' query to '_id' if needed, but mostly we use business logic fields
            return await Model.findOne(query);
        }
    }
    const items = await getCollection(collectionName);
    return items.find(item => {
        for (let key in query) {
            if (item[key] !== query[key]) return false;
        }
        return true;
    });
}

// Find all items matching query
async function find(collectionName, query = {}) {
    if (IS_MONGO) {
        const Model = getModel(collectionName);
        if (Model) return await Model.find(query);
    }
    const items = await getCollection(collectionName);
    if (Object.keys(query).length === 0) return items;

    return items.filter(item => {
        for (let key in query) {
            if (item[key] !== query[key]) return false;
        }
        return true;
    });
}

// Insert item
async function insert(collectionName, item) {
    if (IS_MONGO) {
        const Model = getModel(collectionName);
        if (Model) {
            const doc = new Model(item);
            await doc.save();
            return doc.toObject();
        }
    }

    const items = await getCollection(collectionName);
    const newItem = {
        _id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...item
    };
    items.push(newItem);
    await saveCollection(collectionName, items);
    return newItem;
}

// Update item by ID
async function update(collectionName, id, updates) {
    if (IS_MONGO) {
        const Model = getModel(collectionName);
        if (Model) {
            return await Model.findByIdAndUpdate(id, updates, { new: true });
        }
    }

    const items = await getCollection(collectionName);
    const index = items.findIndex(i => i._id === id || i._id.toString() === id);
    if (index === -1) return null;

    items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
    await saveCollection(collectionName, items);
    return items[index];
}

// Delete item by ID or Query (Simplification: ID only usually)
async function deleteOne(collectionName, query) {
    if (IS_MONGO) {
        const Model = getModel(collectionName);
        if (Model) {
            await Model.deleteOne(query);
            return true;
        }
    }

    const items = await getCollection(collectionName);
    const index = items.findIndex(item => {
        for (let key in query) {
            if (item[key] !== query[key]) return false;
        }
        return true;
    });

    if (index !== -1) {
        items.splice(index, 1);
        await saveCollection(collectionName, items);
        return true;
    }
    return false;
}

// Delete many
async function deleteMany(collectionName, query) {
    if (IS_MONGO) {
        const Model = getModel(collectionName);
        if (Model) {
            await Model.deleteMany(query);
            return true;
        }
    }

    let items = await getCollection(collectionName);
    const initialLen = items.length;

    items = items.filter(item => {
        for (let key in query) {
            if (item[key] === query[key]) return false; // Remove if matches
        }
        return true; // Keep if doesn't match
    });

    if (items.length !== initialLen) {
        await saveCollection(collectionName, items);
    }
}


// List all .json files in data directory
async function listDataFiles() {
    await ensureDataDir();
    try {
        const files = await fs.readdir(DATA_DIR);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));
    } catch (err) {
        return [];
    }
}

// Check if file exists
async function checkFileExists(key, tenantId) {
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
    checkFileExists,
    // DB Helpers
    findOne,
    find,
    insert,
    update,
    deleteOne,
    deleteMany
};
