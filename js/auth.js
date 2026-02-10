// Ali Karam POS System - Enhanced Authentication & Security
// Compatible with Windows 7+ browsers and works fully offline
// Includes one-time license activation system

// Ali Karam POS System - Enhanced Authentication & Security
// Compatible with Windows 7+ browsers and works fully offline
// Includes one-time license activation system

// Enhanced Security System
window.DataCache = window.DataCache || {};

// Migration & Initialization
async function initializeDataSystem() {
    // 🟢 1️⃣ CRITICAL FIX: Prevent Overlay Creation on Login Page
    const isLoginPage = !!document.getElementById('loginForm');
    if (isLoginPage) {
        console.log('🔐 Login page Detected -> Skipping data system & overlay completely.');
        return;
    }

    // Inject or Repair Loading Toast (Non-intrusive)
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        document.body.appendChild(overlay);

        // Inject Toast Styles
        const style = document.createElement('style');
        style.textContent = `
            #loadingOverlay {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: rgba(15, 23, 42, 0.9); /* Slate-900 */
                color: white;
                padding: 12px 20px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                gap: 12px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                z-index: 9999;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none; /* Non-blocking */
                border: 1px solid rgba(255,255,255,0.1);
                backdrop-filter: blur(8px);
            }
            #loadingOverlay.active {
                opacity: 1;
                transform: translateY(0);
            }
            .loader-spinner {
                width: 18px;
                height: 18px;
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                border-top-color: #fff;
                animation: spin 0.8s linear infinite;
            }
            .loader-text {
                font-family: 'Inter', sans-serif;
                font-size: 0.875rem;
                font-weight: 500;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // FAILSAFE: Force remove overlay after 5 seconds no matter what
    setTimeout(() => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay && overlay.classList.contains('active')) {
            console.log('🛡️ Safety: Ensuring loading toast is hidden.');
            overlay.classList.remove('active');
        }
    }, 5000);

    // Ensure content exists
    if (!overlay.querySelector('.loader-text')) {
        overlay.innerHTML = `
            <div class="loader-spinner"></div>
            <div class="loader-text">Synchronizing...</div>
        `;
    }

    // Global Loader Controls
    window.showLoading = (msg = 'Loading...') => {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            const textEl = loader.querySelector('.loader-text');
            if (textEl) textEl.textContent = msg;
            loader.classList.add('active');
        }
    };

    window.hideLoading = () => {
        const loader = document.getElementById('loadingOverlay');
        if (loader) loader.classList.remove('active');
    };

    if (!window.electronAPI) return; // Web mode

    // PERFORMANCE OPTIMIZATION: Skip heavy sync on Login Page
    // (Logic moved to top of function - Block removed)

    // Start Loading UI
    if (window.showLoading) window.showLoading('Synchronizing Data...');

    console.log('Initializing Data System...');

    // ROBUST ERROR HANDLING WRAPPER start
    try {
        // Ensure data directory exists (Skip on Cloud/Railway to reduce noise)
        const isCloud = window.location.hostname.includes('railway.app') || window.location.hostname.includes('vercel.app');
        if (!isCloud) {
            try {
                await window.electronAPI.ensureDataDir();
            } catch (e) {
                console.warn('⚠️ ensureDataDir failed, continuing...', e);
            }
        } // Else: Cloud mode assumes environment is ready

        // List of keys to load
        // List of known keys (fallback)
        // List of known keys (fallback)
        let keys = [
            'users', 'products', 'customers', 'vendors',
            'visits', 'sales', 'returns', 'expenses',
            'shop_settings', 'license', 'spare_parts', 'vehicles',
            'vendor_payments', 'employees', 'ingredients', 'vendor_transactions'
        ];

        // 🚀 TIMING FIX: Only list data files if we have a branch context or are post-login
        const currentPath = window.location.pathname;
        const branchId = localStorage.getItem('activeBranchId');
        const shouldFetchData = branchId && branchId !== 'bypass' && !currentPath.endsWith('index.html');

        if (shouldFetchData) {
            let loadedFiles = null;
            let retries = 3;

            while (retries > 0 && !loadedFiles) {
                try {
                    if (window.electronAPI.listDataFiles) {
                        loadedFiles = await window.electronAPI.listDataFiles(branchId);
                        if (loadedFiles && loadedFiles.length > 0) {
                            console.log('📂 Discovered data files:', loadedFiles);
                            const allKeys = [...new Set([...keys, ...loadedFiles])];
                            keys = allKeys.filter(k => k !== 'session');
                        }
                    } else {
                        break; // No API, stop retrying
                    }
                } catch (err) {
                    console.error(`Failed to list data files (Attempts left: ${retries - 1}):`, err);
                    retries--;
                    if (retries > 0) await new Promise(res => setTimeout(res, 1000)); // Wait 1s
                }
            }
        } else {
            console.log('⏳ Skipping Data List: Waiting for Branch Selection/Login');
        }

        let migrationNeeded = false;

        // 🚀 SaaS Hardening: Verify Session with Server via Cookies
        try {
            // Include credentials to send cookies, and no-cache to avoid stale responses
            const meRes = await fetch('/api/auth/me', {
                credentials: 'include',
                headers: { 'Cache-Control': 'no-cache' }
            });

            if (meRes.ok) {
                const meUser = await meRes.json();
                console.log('✅ Session Verified:', meUser.username);
                // Update local session cache
                await EnhancedSecurity.storeSecureData('session', meUser);

                // 🚀 If on index.html but already logged in, handle navigation
                if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                    const activeBranch = localStorage.getItem('activeBranchId');
                    // If we have a branch, go to POS
                    if (activeBranch && activeBranch !== 'bypass' && activeBranch !== 'null') {
                        console.log('🔄 Already logged in with branch -> Redirecting to POS');
                        window.location.href = 'pos.html';
                    } else {
                        // Logged in but no branch? Show picker
                        console.log('⚠️ Logged in but no branch selected -> Showing Picker');
                        const branches = meUser.branches || [];
                        if (branches.length > 0) {
                            showBranchPicker(branches, meUser.defaultBranchId);
                        } else {
                            console.warn('User has no branches? Redirecting to POS (Legacy Mode).');
                            window.location.href = 'pos.html';
                        }
                    }
                }

            } else {
                if (meRes.status === 401 || meRes.status === 403) {
                    console.error(`⛔ Session Expired/Invalid [${meRes.status}] -> Redirecting to Login`);
                    await EnhancedSecurity.storeSecureData('session', null);
                    if (!window.location.pathname.includes('index.html')) {
                        console.log('Redirecting now...');
                        window.location.href = 'index.html';
                        return;
                    }
                }
            }
        } catch (err) {
            console.error('Session Check Failed (Offline?):', err);
            // If offline, trust local session for now (Optional: enforce online logic?)
        }

        // 🚀 TIMING OPTIMIZATION: Smart Tiered Loading
        const CRITICAL_KEYS = [
            'users', 'products', 'customers', 'shop_settings',
            'license', 'tables', 'delivery_areas', 'salesmen',
            'settings', 'ingredients', 'spare_parts', 'vehicles',
            'vendors' // Vendors needed for restocking in POS? Maybe. Safe to include.
        ];

        const BACKGROUND_KEYS = [
            'visits', 'sales', 'returns', 'expenses',
            'vendor_payments', 'vendor_transactions', 'employees'
        ];

        // Ensure keys are correctly categorized
        const allKeys = keys; // Keys from listDataFiles or default
        const criticalBatch = allKeys.filter(k => CRITICAL_KEYS.includes(k) || !BACKGROUND_KEYS.includes(k)); // Default to critical if unknown
        const backgroundBatch = allKeys.filter(k => BACKGROUND_KEYS.includes(k));

        const loadBatch = async (batchName, batchKeys) => {
            if (batchKeys.length === 0) return;
            // console.log(`⏳ Loading ${batchName} Batch (${batchKeys.length})...`);

            const promises = batchKeys.map(async (key) => {
                if (key === 'session') return;
                let fileData = null;

                // 1. Try Read File
                try {
                    const fileContent = await window.electronAPI.readData(key);
                    if (fileContent) {
                        try { fileData = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent; }
                        catch (e) { fileData = fileContent; }
                    }
                } catch (err) { console.warn(`Failed to load ${key}`, err); }

                // 2. Fallback
                if (!fileData) {
                    const local = localStorage.getItem('pos_backup_' + key);
                    if (local) { try { fileData = JSON.parse(local); } catch (e) { fileData = local; } }
                }

                if (fileData) window.DataCache[key] = fileData;
                else window.DataCache[key] = [];
            });

            await Promise.all(promises);
            // console.log(`✅ Loaded ${batchName} Batch.`);
        };

        const isPosPage = window.location.pathname.endsWith('pos.html') || window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
        const isReportsPage = window.location.pathname.includes('reports') || window.location.pathname.includes('admin') || window.location.pathname.includes('history');

        // STRATEGY:
        // 1. POS: Load Critical -> Open UI -> Load Background
        if (isPosPage && !isReportsPage) {
            console.log('🚀 Smart Loading: Priority Optimization for POS');
            await loadBatch('Critical', criticalBatch);

            // Start Background Load (Fire & Forget)
            loadBatch('Background', backgroundBatch).then(() => {
                console.log('📦 Background Data Synced.');
                window.dispatchEvent(new Event('BackgroundDataReady'));
            });

            console.log(`✅ System critical data loaded. Background sync started.`);
        } else {
            // Standard Load (Wait for everything)
            console.log('🛡️ Standard Loading: Full Consistency Mode');
            await loadBatch('Critical', criticalBatch);
            await loadBatch('Background', backgroundBatch);
            console.log(`✅ System Data Fully Loaded: ${keys.length} entities.`);
        }

        if (migrationNeeded) {
            console.log('Migration/Recovery completed successfully.');
        }

    } catch (criticalError) {
        console.error('❌ CRITICAL SYSTEM ERROR during initialization:', criticalError);
        // Optional: Alert the user, but don't block
        // alert('System Warning: Some data failed to load. Check console.');
    } finally {
        // ALWAYS Hide Loading Overlay - This fixes the freezing issue
        console.log('🔒 executing finally block - Unblocking UI');
        // Hide Loading Overlay (Class-based)
        if (window.hideLoading) window.hideLoading();

        // Signal that system is ready (even if partial failure, we proceed)
        window.SystemReady = true;
        window.dispatchEvent(new Event('SystemDataReady'));
        console.log('🚀 System Data Ready Event Dispatched');

        // 🚀 Auto-Seed Defaults if missing (Critical for fresh SaaS deployments)
        await seedDefaultsIfMissing();
    }
}

// ✅ Branch Bootstrapper
async function resolveBranchAndStart() {
    try {
        const user = await window.apiFetch("/auth/me", { method: "GET" });

        if (!user) {
            throw new Error("No user data");
        }

        const branches = user.branches || [];

        if (!branches.length) {
            alert("No branches assigned to your account.");
            return;
        }

        if (branches.length === 1) {
            localStorage.setItem("activeBranchId", branches[0].id);
            initializeDataSystem();
            return;
        }

        const current = localStorage.getItem("activeBranchId");
        if (current && branches.find(b => b.id === current)) {
            initializeDataSystem();
            return;
        }

        showBranchSelector(branches);

    } catch (err) {
        console.error("❌ Branch resolution failed", err);

        // If we get a 401 (no token / auth denied), redirect to login
        // But only if we're not already on the login page
        const isLoginPage = window.location.pathname.endsWith('index.html') ||
            window.location.pathname === '/' ||
            window.location.pathname === '';

        if (!isLoginPage) {
            // Check if the error is auth-related
            const errMsg = err?.message || String(err);
            if (errMsg.includes('token') || errMsg.includes('authorization') || errMsg.includes('401') || errMsg.includes('denied')) {
                console.log('🔒 Auth required, redirecting to login...');
                window.location.href = 'index.html';
                return;
            }
        }

        // For non-auth errors, just log and continue (let user access page)
        console.warn('⚠️ Branch resolution issue, continuing with local data');
    }
}

function showBranchSelector(branches) {
    // Use existing overlay if possible, or create new simple one
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position:fixed;
        inset:0;
        background:rgba(0,0,0,0.9);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:9999;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
        background:white;
        padding:25px;
        border-radius:10px;
        width:320px;
        text-align:center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    `;

    box.innerHTML = `<h3 style="margin-top:0; color:#333;">Select Branch</h3><p style="color:#666; margin-bottom:15px;">Please choose a location to continue</p>`;

    branches.forEach(b => {
        const btn = document.createElement("button");
        btn.innerHTML = `<strong>${b.name}</strong><br><small>${b.code || ''}</small>`;
        btn.style.cssText = "display:block; width:100%; margin:8px 0; padding:12px; border:1px solid #ddd; border-radius:6px; background:#f5f5f5; cursor:pointer; text-align:left;";
        btn.onmouseover = () => btn.style.background = '#e9e9e9';
        btn.onmouseout = () => btn.style.background = '#f5f5f5';

        btn.onclick = () => {
            localStorage.setItem("activeBranchId", b.id);
            document.body.removeChild(overlay);
            initializeDataSystem();
            // Redirect to POS if on login page
            if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                window.location.href = 'pos.html';
            }
        };
        box.appendChild(btn);
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// Call init (RESOLVER)
if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', resolveBranchAndStart);
}

// === LICENSE CRYPTO MODULE ===
window.LicenseCrypto = {
    SECRET_KEY: "Tashgheel_Services_Secure_2025_#$#",

    validateKey: function (licenseKey, machineId) {
        try {
            if (!licenseKey) return { valid: false, error: "Empty Key" };

            // 1. Decode format (Signature.Payload)
            const raw = atob(licenseKey);
            const parts = raw.split('.');
            if (parts.length !== 2) return { valid: false, error: "Invalid Key Format" };

            const signature = parts[0];
            const encrypted = parts[1];

            // 2. Verify Signature
            const docSig = this._hashString(encrypted + this.SECRET_KEY);
            if (docSig !== signature) return { valid: false, error: "Key Integrity Check Failed" };

            // 3. Decrypt
            const jsonStr = this._decryptString(encrypted, this.SECRET_KEY);
            if (!jsonStr) return { valid: false, error: "Decryption Failed" };

            const payload = JSON.parse(jsonStr);

            // 4. Validate Constraints
            // Machine ID check (normalization for safety)
            if (payload.mid.trim() !== machineId.trim()) {
                return { valid: false, error: "Key belongs to another machine" };
            }

            return { valid: true, payload: payload };

        } catch (e) {
            console.error(e);
            return { valid: false, error: "Validation Error" };
        }
    },

    _decryptString: function (text, key) {
        try {
            const decoded = atob(text);
            let result = "";
            for (let i = 0; i < decoded.length; i++) {
                const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                result += String.fromCharCode(charCode);
            }
            // Reverse UTF-8 encoding
            return decodeURIComponent(escape(result));
        } catch (e) { return null; }
    },

    _hashString: function (str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return (hash >>> 0).toString(16);
    }
};

var EnhancedSecurity = {
    // Encryption settings
    encryptionKey: 'AliKaram@2025!POS#Security$Enhanced&',

    // Simple encryption for demo (use stronger encryption in production)
    encrypt: function (text) {
        if (!text) return '';
        var result = '';
        for (var i = 0; i < text.length; i++) {
            result += String.fromCharCode(
                text.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
            );
        }
        return btoa(unescape(encodeURIComponent(result))); // ✅ Unicode-safe
    },

    decrypt: function (encryptedText) {
        if (!encryptedText) return '';
        try {
            var text = decodeURIComponent(escape(atob(encryptedText))); // ✅ Unicode-safe
            var result = '';
            for (var i = 0; i < text.length; i++) {
                result += String.fromCharCode(
                    text.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
                );
            }
            return result;
        } catch (e) {
            return '';
        }
    }
    ,

    // Store encrypted data
    storeSecureData: async function (key, data) {
        // 🔍 DEBUG: Trace who is writing to session
        if (key === 'session') {
            console.warn(`💾 WRITING DATA to session:`, data);
        }

        // 1. Update Memory Cache immediately
        if (!window.DataCache) window.DataCache = {};
        window.DataCache[key] = data;

        // 2. Backup to LocalStorage (Redundancy)
        try {
            localStorage.setItem('pos_backup_' + key, JSON.stringify(data));
        } catch (e) { console.warn('LocalStorage Quota Exceeded or Error:', e); }

        // 3. Async save to File (if available)
        if (window.electronAPI && window.electronAPI.saveData) {
            try {
                const res = await window.electronAPI.saveData(key, data);
                if (!res.success) {
                    console.error('Background Save Failed:', res.error);
                    return false;
                }
                return true;
            } catch (err) {
                console.error('Electron Save Error:', err);
                // We return true because LocalStorage presumably worked
                return true;
            }
        }

        return true;
    },

    // Get encrypted data
    getSecureData: function (key, skipCache = false) {
        // Strict Mode: Only use memory cache (populated from file/LS at boot)
        if (window.DataCache && window.DataCache[key]) {
            return window.DataCache[key];
        }
        // Fallback: Check LS directly if cache missed (emergency)
        const local = localStorage.getItem('pos_backup_' + key);
        if (local) {
            try { return JSON.parse(local); } catch (e) { return null; }
        }
        return null;
    },

    // Generate unique system fingerprint
    generateSystemFingerprint: function () {
        var fingerprint = '';
        fingerprint += navigator.userAgent;
        fingerprint += navigator.language;
        fingerprint += screen.width + 'x' + screen.height;

        var hash = 0;
        for (var i = 0; i < fingerprint.length; i++) {
            var char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        return 'FP' + Math.abs(hash).toString(16).toUpperCase();
    },

    // Get detailed license status
    checkLicenseStatus: function () {
        const licenseData = this.getLicenseData();

        // 1. Basic Existence Check
        if (!licenseData || !licenseData.activated || !licenseData.licenseKey) {
            return { valid: false, error: "Not Activated" };
        }

        // 2. Crypto Verification
        if (window.LicenseCrypto) {
            return window.LicenseCrypto.validateKey(licenseData.licenseKey, licenseData.systemFingerprint);
        }

        return { valid: true, warning: "Crypto Missing" };
    },

    // Check if system is activated (SaaS Mode: Always True)
    isSystemActivated: function () {
        return true;
    },

    // Activate license using the provided key and current machine fingerprint
    activateLicenseWithFingerprint: async function (licenseKey, fingerprint) {
        if (!window.LicenseCrypto) {
            return { success: false, error: "Security module missing (LicenseCrypto)." };
        }

        // 1. Validate the Key using Crypto Module
        const result = window.LicenseCrypto.validateKey(licenseKey, fingerprint);

        if (!result.valid) {
            return { success: false, error: result.error || "Invalid License Key" };
        }

        // 2. Success! Extract Payload
        const payload = result.payload;
        const businessName = payload.biz; // From the key itself!

        const activationData = {
            licenseKey: licenseKey,
            businessName: businessName,
            activated: true,
            activatedDate: new Date().toISOString(),
            systemFingerprint: fingerprint,
            type: payload.type,
            expiryDate: result.daysLeft !== 9999 ? new Date(Date.now() + (payload.days * 24 * 60 * 60 * 1000)).toISOString() : null
        };

        // 3. Store Securely
        // Using await here to ensure file is written before we return success
        const stored = await this.storeSecureData('license', activationData);
        if (stored) {
            await initializeDefaultData(); // Ensure defaults are written
            return { success: true, data: activationData };
        } else {
            return { success: false, error: "Failed to save license data." };
        }
    },

    // Get license data
    getLicenseData: function () {
        return this.getSecureData('license');
    }
};

// Default users with enhanced encryption
var defaultUsers = [
    {
        id: 1,
        username: 'admin',
        passwordHash: 'admin123hash', // Will be encrypted after activation
        role: 'admin',
        fullName: 'System Administrator',
        active: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 2,
        username: 'manager',
        passwordHash: 'manager123hash',
        role: 'manager',
        fullName: 'Store Manager',
        active: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 3,
        username: 'cashier',
        passwordHash: 'cashier123hash',
        role: 'cashier',
        fullName: 'Cashier User',
        active: true,
        createdAt: new Date().toISOString()
    }
];

// Enhanced password hashing
function hashPassword(password) {
    if (EnhancedSecurity.isSystemActivated()) {
        return EnhancedSecurity.encrypt(password);
    }
    return password + 'hash'; // Fallback for compatibility
}

// Enhanced password verification
function verifyPassword(password, hash) {
    if (EnhancedSecurity.isSystemActivated()) {
        var decrypted = EnhancedSecurity.decrypt(hash);
        return decrypted === password;
    }
    return hash === password + 'hash'; // Fallback
}

// Initialize users with enhanced security
function initializeUsers() {
    if (EnhancedSecurity.isSystemActivated()) {
        var existingUsers = EnhancedSecurity.getSecureData('users');
        if (!existingUsers || existingUsers.length === 0) {
            initializeDefaultData();
        }
    } else {
        // Fallback for non-activated check (should not happen in strict mode if activated)
        // Check memory cache anyway
        var existingUsers = EnhancedSecurity.getSecureData('users');
        if (!existingUsers || existingUsers.length === 0) {
            // In strict file mode, we might want default users if file is empty
            // But usually activation handles this.
        }
    }
}

// 🚀 Dedicated Seeding Function for Missing Data
async function seedDefaultsIfMissing() {
    console.log('🌱 Checking for missing default data...');

    // 1. Check Products (Menu Items)
    const products = EnhancedSecurity.getSecureData('spare_parts');
    if (!products || products.length === 0) {
        console.log('⚠️ No products found. Seeding defaults...');
        const defaultProducts = [
            {
                id: 1,
                name: 'Coca Cola 330ml',
                nameEn: 'Coca Cola 330ml',
                barcode: '1234567890123',
                price: 5.00,
                cost: 2.50,
                stock: 100,
                category: 'Beverages',
                image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=100'
            },
            {
                id: 2,
                name: 'Chicken Burger',
                nameEn: 'Chicken Burger',
                barcode: '2345678901234',
                price: 15.00,
                cost: 8.00,
                stock: 50,
                category: 'Meals',
                image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=100'
            },
            {
                id: 3,
                name: 'French Fries',
                nameEn: 'French Fries',
                barcode: '3456789012345',
                price: 8.00,
                cost: 3.00,
                stock: 50,
                category: 'Appetizers',
                image: 'https://images.unsplash.com/photo-1630384060421-a43b35d259fb?w=100'
            },
            {
                id: 4,
                name: 'Espresso',
                nameEn: 'Espresso',
                barcode: '4567890123456',
                price: 12.00,
                cost: 4.00,
                stock: 100,
                category: 'Hot Drinks',
                image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=100'
            }
        ];
        await EnhancedSecurity.storeSecureData('spare_parts', defaultProducts);
    }

    // 2. Check Ingredients (Raw Materials)
    const ingredients = EnhancedSecurity.getSecureData('ingredients');
    if (!ingredients || ingredients.length === 0) {
        console.log('⚠️ No ingredients found. Seeding defaults...');
        const defaultIngredients = [
            { id: 101, name: 'Sugar', unit: 'kg', cost: 5.0, stock: 10, vendorId: null, lastRestockDate: new Date().toISOString() },
            { id: 102, name: 'Coffee Beans', unit: 'kg', cost: 45.0, stock: 5, vendorId: null, lastRestockDate: new Date().toISOString() },
            { id: 103, name: 'Milk', unit: 'l', cost: 4.0, stock: 20, vendorId: null, lastRestockDate: new Date().toISOString() },
            { id: 104, name: 'Flour', unit: 'kg', cost: 3.5, stock: 15, vendorId: null, lastRestockDate: new Date().toISOString() },
            { id: 105, name: 'Chicken Breast', unit: 'kg', cost: 25.0, stock: 20, vendorId: null, lastRestockDate: new Date().toISOString() },
            { id: 106, name: 'Potato', unit: 'kg', cost: 2.0, stock: 50, vendorId: null, lastRestockDate: new Date().toISOString() }
        ];
        await EnhancedSecurity.storeSecureData('ingredients', defaultIngredients);
    }
}

// Initialize default data after activation
async function initializeDefaultData() {
    // Enhanced users with encrypted passwords
    var enhancedUsers = [
        {
            id: 1,
            username: 'admin',
            passwordHash: EnhancedSecurity.encrypt('admin123'),
            role: 'admin',
            fullName: 'System Administrator',
            active: true,
            createdAt: new Date().toISOString()
        },
        {
            id: 2,
            username: 'manager',
            passwordHash: EnhancedSecurity.encrypt('manager123'),
            role: 'manager',
            fullName: 'Store Manager',
            active: true,
            createdAt: new Date().toISOString()
        },
        {
            id: 3,
            username: 'cashier',
            passwordHash: EnhancedSecurity.encrypt('cashier123'),
            role: 'cashier',
            fullName: 'Cashier User',
            active: true,
            createdAt: new Date().toISOString()
        }
    ];

    await EnhancedSecurity.storeSecureData('users', enhancedUsers);

    // Default products
    var defaultProducts = [
        {
            id: 1,
            name: 'كوكا كولا 330مل',
            nameEn: 'Coca Cola 330ml',
            barcode: '1234567890123',
            price: 25.50,
            stock: 100,
            minStock: 10,
            category: 'مشروبات',
            categoryEn: 'Beverages'
        },
        {
            id: 2,
            name: 'تيشيرت أبيض مقاس وسط',
            nameEn: 'White T-Shirt Medium',
            barcode: '2345678901234',
            price: 299.99,
            stock: 25,
            minStock: 5,
            category: 'ملابس',
            categoryEn: 'Clothing'
        },
        {
            id: 3,
            name: 'كراسة A4',
            nameEn: 'Notebook A4',
            barcode: '3456789012345',
            price: 65.25,
            stock: 50,
            minStock: 10,
            category: 'مكتبية',
            categoryEn: 'Stationery'
        },
        {
            id: 4,
            name: 'كوب قهوة',
            nameEn: 'Coffee Mug',
            barcode: '4567890123456',
            price: 179.99,
            stock: 30,
            minStock: 5,
            category: 'منزلية',
            categoryEn: 'Home'
        },
        {
            id: 5,
            name: 'ماوس لاسلكي',
            nameEn: 'Wireless Mouse',
            barcode: '5678901234567',
            price: 510.50,
            stock: 15,
            minStock: 3,
            category: 'إلكترونيات',
            categoryEn: 'Electronics'
        }
    ];

    await EnhancedSecurity.storeSecureData('spare_parts', defaultProducts);
    await EnhancedSecurity.storeSecureData('sales', []);
    await EnhancedSecurity.storeSecureData('returns', []);
}

// Get all users (enhanced version)
function getUsers() {
    return EnhancedSecurity.getSecureData('users') || [];
}

// Save users (enhanced version)
function saveUsers(users) {
    return EnhancedSecurity.storeSecureData('users', users);
}

// Get current logged in user
function getCurrentUser() {
    // Read from secure storage with fallback
    return EnhancedSecurity.getSecureData('session');
}

// Show/Hide Register Modal
window.showRegisterModal = function () {
    document.getElementById('registerModal').style.display = 'flex';
};

// Handle Registration Form Submit
document.addEventListener('DOMContentLoaded', () => {
    const regForm = document.getElementById('registerForm');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const businessName = document.getElementById('regBusinessName').value;
            const email = document.getElementById('regEmail').value;
            const phone = document.getElementById('regPhone').value;
            const username = document.getElementById('regUsername').value;
            const password = document.getElementById('regPassword').value;

            try {
                // Refactored to use apiFetch for consistency
                const data = await window.apiFetch('auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ businessName, email, phone, username, password })
                });

                // apiFetch throws on error, so if we are here, it's successful.

                alert('Registration Successful! You can now log in.');
                document.getElementById('registerModal').style.display = 'none';

                // Auto-fill login
                document.getElementById('businessEmail').value = email;
                document.getElementById('username').value = username;
                document.getElementById('password').value = password;

            } catch (err) {
                alert('Error: ' + err.message);
            }
        });
    }
});

// Enhanced login function calling Backend API
async function login(username, password) {
    const businessEmail = document.getElementById('businessEmail').value;
    if (!businessEmail) {
        alert('Please enter Business Email');
        return false;
    }

    try {
        // Refactored to use apiFetch - includes credentials automatically
        const data = await window.apiFetch('auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password, businessEmail })
        });

        // If we reach here, login is successful (apiFetch throws on non-200)


        const user = data.user;
        // const token = data.token; // REMOVED: Token is now in HTTP-Only Cookie

        // Create Session Object
        var sessionUser = {
            id: user.id || 'api_user',
            tenantId: user.tenantId, // Store Tenant ID
            username: user.username,
            role: user.role,
            fullName: user.fullName,
            allowedPages: [],
            loginTime: new Date().toISOString()
            // token: token // No longer stored
        };

        if (user.tenantId) localStorage.setItem('tenant_id', user.tenantId);

        // Persist session to file/storage
        await EnhancedSecurity.storeSecureData('session', sessionUser);

        // 🚀 Multi-Branch Logic
        const branches = user.branches || [];

        // Scenario A: Legacy / No Branches
        if (branches.length === 0) {
            console.warn('User has no branches linked. Defaulting to legacy mode.');
            window.location.href = 'pos.html';
            return true;
        }

        // Scenario B: Single Branch -> Auto Select
        else if (branches.length === 1) {
            localStorage.setItem('activeBranchId', branches[0].id);
            window.location.href = 'pos.html';
            return true;
        }

        // Scenario C: Multiple Branches -> Show Picker
        else {
            showBranchPicker(branches, user.defaultBranchId);
            return true;
        }

        return true;

    } catch (err) {
        console.error('Login system error:', err);
        alert('System Error during login');
        return false;
    }
}

// 🏢 Branch Picker UI Logic
function showBranchPicker(branches, defaultBranchId) {
    const modal = document.getElementById('branchModal');
    const list = document.getElementById('branchList');
    if (!modal || !list) return;

    list.innerHTML = ''; // Clear

    branches.forEach(branch => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        // Style simply matches existing buttons
        btn.style.cssText = `
            padding: 12px; border: 1px solid #ddd; background: #f9f9f9; 
            border-radius: 6px; cursor: pointer; font-weight: bold;
            display: flex; justify-content: space-between; align-items: center;
        `;

        // Display Name + Code
        btn.innerHTML = `<span>${branch.name}</span> <span style="color:#666; font-size:0.8em">${branch.code}</span>`;

        btn.onclick = () => selectBranch(branch.id);
        list.appendChild(btn);
    });

    modal.style.display = 'flex';
}

function selectBranch(branchId) {
    if (!branchId) return console.error('Branch ID is required.');

    // Save branch ID
    localStorage.setItem('activeBranchId', branchId);
    console.log('✅ Branch selected:', branchId);

    // Fire event to notify system
    window.dispatchEvent(new Event('branchSelected'));

    // Initialize data immediately after selection (if logical)
    // Or just redirect to POS which triggers init
    window.location.href = 'pos.html';
}

// Logout function
async function logout(force = false) {
    if (force || await confirm('Are you sure you want to logout?')) {
        try {
            await fetch('/api/auth/logout', { method: 'POST' }); // Clear Cookies
        } catch (e) { console.error('Logout API failed', e); }

        await EnhancedSecurity.storeSecureData('session', null);
        window.location.href = 'index.html';
    }
}

// Check if user has permission based on role hierarchy
function hasPermission(requiredRole) {
    var currentUser = getCurrentUser();
    if (!currentUser) return false;

    const roles = getSystemRoles();

    // Convert current user role to level
    const userRoleObj = roles.find(r => r.name === currentUser.role);
    const userLevel = userRoleObj ? userRoleObj.level : 0;

    // Convert required role to level
    const requiredRoleObj = roles.find(r => r.name === requiredRole);
    // If required role doesn't exist (e.g. hardcoded check), mapping might fail.
    // Fallback: check legacy hardcodes if dynamic lookup fails
    let requiredLevel = requiredRoleObj ? requiredRoleObj.level : 0;

    // Legacy fallback map
    if (requiredLevel === 0) {
        const legacyMap = { 'admin': 10, 'manager': 5, 'inventory_manager': 4, 'technician': 3, 'cashier': 1 };
        requiredLevel = legacyMap[requiredRole] || 0;
    }

    return userLevel >= requiredLevel;
}

// Specific permission checks
function canEditProducts() {
    return hasPermission('inventory_manager'); // Manager + Admin can too
}

function canManageUsers() {
    return hasPermission('admin');
}

function canProcessReturns() {
    return hasPermission('manager');
}

function canViewReports() {
    return hasPermission('manager'); // Stricter than before
}

function canDeleteSales() {
    return hasPermission('admin');
}

function canManageVisits() {
    var r = getCurrentUser()?.role;
    return r === 'admin' || r === 'manager' || r === 'technician';
}

// Enhanced add user function
function addUser(userData) {
    if (!canManageUsers()) {
        throw new Error('Permission denied - Admin access required');
    }

    var users = getUsers();

    for (var i = 0; i < users.length; i++) {
        if (users[i].username === userData.username && users[i].active) {
            throw new Error('Username already exists');
        }
    }

    if (!userData.username || !userData.password || !userData.role || !userData.fullName) {
        throw new Error('All fields are required');
    }

    var newUser = {
        id: Date.now(),
        username: userData.username,
        passwordHash: hashPassword(userData.password),
        role: userData.role,
        fullName: userData.fullName,
        allowedPages: userData.allowedPages || [], // Store allowed pages
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: getCurrentUser().username
    };

    users.push(newUser);
    saveUsers(users);

    return newUser;
}

// Enhanced edit user function
function editUser(userId, userData) {
    if (!canManageUsers()) {
        throw new Error('Permission denied - Admin access required');
    }

    var users = getUsers();
    var userIndex = -1;

    for (var i = 0; i < users.length; i++) {
        if (users[i].id === userId) {
            userIndex = i;
            break;
        }
    }

    if (userIndex === -1) {
        throw new Error('User not found');
    }

    for (var j = 0; j < users.length; j++) {
        if (users[j].username === userData.username &&
            users[j].id !== userId &&
            users[j].active) {
            throw new Error('Username already exists');
        }
    }

    users[userIndex].username = userData.username;
    users[userIndex].fullName = userData.fullName;
    users[userIndex].role = userData.role;
    if (userData.allowedPages) {
        users[userIndex].allowedPages = userData.allowedPages;
    }

    if (userData.password && userData.password.trim() !== '') {
        users[userIndex].passwordHash = hashPassword(userData.password);
    }

    users[userIndex].updatedAt = new Date().toISOString();
    users[userIndex].updatedBy = getCurrentUser().username;

    saveUsers(users);
    return users[userIndex];
}

// Delete user function
function deleteUser(userId) {
    if (!canManageUsers()) {
        throw new Error('Permission denied - Admin access required');
    }

    var currentUser = getCurrentUser();
    if (currentUser && currentUser.id === userId) {
        throw new Error('Cannot delete your own account');
    }

    var users = getUsers();
    var userIndex = -1;

    for (var i = 0; i < users.length; i++) {
        if (users[i].id === userId) {
            userIndex = i;
            break;
        }
    }

    if (userIndex === -1) {
        throw new Error('User not found');
    }

    var adminCount = 0;
    for (var k = 0; k < users.length; k++) {
        if (users[k].role === 'admin' && users[k].active) {
            adminCount++;
        }
    }

    if (users[userIndex].role === 'admin' && adminCount <= 1) {
        throw new Error('Cannot delete the last admin user');
    }

    users[userIndex].active = false;
    users[userIndex].deletedAt = new Date().toISOString();
    users[userIndex].deletedBy = currentUser.username;

    saveUsers(users);
    return true;
}

// Get active users only
function getActiveUsers() {
    var users = getUsers();
    var activeUsers = [];

    for (var i = 0; i < users.length; i++) {
        if (users[i].active === true) {
            var safeUser = {
                id: users[i].id,
                username: users[i].username,
                role: users[i].role,
                fullName: users[i].fullName,
                createdAt: users[i].createdAt,
                updatedAt: users[i].updatedAt
            };
            activeUsers.push(safeUser);
        }
    }

    return activeUsers;
}

// Change password function
function changePassword(currentPassword, newPassword, confirmPassword) {
    var currentUser = getCurrentUser();
    if (!currentUser) {
        throw new Error('Not logged in');
    }

    if (newPassword !== confirmPassword) {
        throw new Error('New passwords do not match');
    }

    if (newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters long');
    }

    var users = getUsers();
    var user = null;

    for (var i = 0; i < users.length; i++) {
        if (users[i].id === currentUser.id) {
            user = users[i];
            break;
        }
    }

    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
        throw new Error('Current password is incorrect');
    }

    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();

    saveUsers(users);
    return true;
}

// Check if user session is valid
function isSessionValid() {
    var currentUser = getCurrentUser();
    if (!currentUser) {
        // 🚀 WEB/SaaS MODE FALLBACK: 
        // In web mode, HTTP-Only cookies manage the actual session on the server.
        // The client doesn't have direct access to the token.
        // If we have an activeBranchId, it means the user COMPLETED a login flow.
        const activeBranch = localStorage.getItem('activeBranchId');
        if (activeBranch && activeBranch !== 'null' && activeBranch !== 'bypass') {
            console.log('ℹ️ isSessionValid: No local session object, but activeBranchId found. Trusting cookie auth.');
            return true; // Trust that a valid cookie session exists
        }
        return false;
    }

    // 🚀 SaaS/API Mode: If we have an API token, the session is managed by the server
    if (currentUser.token) return true;

    // Legacy File Mode: Cross-reference with local users.json
    var users = getUsers();
    for (var i = 0; i < users.length; i++) {
        if (users[i].id === currentUser.id && users[i].active === true) {
            return true;
        }
    }

    // Default: Invalid session
    return false;
}

// Get user activity log
function getUserActivity() {
    var currentUser = getCurrentUser();
    return {
        username: currentUser ? currentUser.username : 'Guest',
        role: currentUser ? currentUser.role : 'None',
        loginTime: currentUser ? currentUser.loginTime : null,
        sessionDuration: currentUser ?
            Math.floor((new Date() - new Date(currentUser.loginTime)) / 1000 / 60) + ' minutes' :
            'Not logged in'
    };
}

// Initialize on page load - compatible with older browsers
if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
        initializeUsers();
    });
} else if (document.attachEvent) {
    document.attachEvent('onreadystatechange', function () {
        if (document.readyState === 'complete') {
            initializeUsers();
        }
    });
}

// Ensure default admin user exists after activation
function ensureDefaultAdmin() {
    if (!EnhancedSecurity.isSystemActivated()) return;

    const users = getUsers();
    const hasAdmin = users.some(u => u.username === 'admin' && u.active);
    if (!hasAdmin) {
        users.push({
            id: Date.now(),
            username: 'admin',
            passwordHash: EnhancedSecurity.encrypt('admin123'),
            role: 'admin',
            fullName: 'System Administrator',
            active: true,
            createdAt: new Date().toISOString()
        });
        saveUsers(users);
    }
}
ensureDefaultAdmin();

// Page Permissions Enforcement
function enforcePagePermissions() {
    let sessionUser = getCurrentUser();
    if (!sessionUser) return; // Login page handles this

    // 1. Refresh permissions
    // 🚀 INTEGRITY CHECK: If session looks like a default dummy, try to reload it
    if (sessionUser && sessionUser.username === 'User') {
        const rawLocal = localStorage.getItem('pos_backup_session'); // ✅ Corrected Key
        if (rawLocal) {
            try {
                const refreshed = JSON.parse(rawLocal);
                if (refreshed && refreshed.username && refreshed.username !== 'User') {
                    console.warn('🔄 Self-Healing: Refreshed stale session found in LocalStorage (pos_backup_session)', refreshed.username);
                    sessionUser = refreshed;
                    // Restore to cache too
                    EnhancedSecurity.storeSecureData('session', refreshed);
                }
            } catch (e) { }
        }
    }

    // 🚀 SaaS/API Mode: Trust the bearer token session
    if (sessionUser && !sessionUser.token) {
        // If no token property, it means we are using Cookie Auth (New implementation)
        // We assume the check in initializeDataSystem validated the session.
        // So proceed.
    } else if (sessionUser.token) {
        // Legacy/Transition: Token exists
    } else {
        // Legacy File Mode: Find in local users.json
        try {
            const allUsers = getUsers();
            const freshUser = allUsers.find(u => u.id === sessionUser.id);
            if (freshUser) {
                sessionUser = { ...sessionUser, ...freshUser };
            } else {
                // Only logout if NO token AND not found locally
                logout(true);
                return;
            }
        } catch (e) {
            console.error('Error refreshing user permissions', e);
        }
    }



    console.warn('🔒 Permission Check:', {
        username: sessionUser.username,
        role: sessionUser.role,
        isAdmin: sessionUser.role === 'admin'
    });

    // Check Case-Insensitive for robustness
    if (sessionUser.role && sessionUser.role.toLowerCase() === 'admin') {
        console.warn('✅ User is Admin -> Bypassing Enforcement');
        return;
    }


    // 2. Check current page access
    const path = window.location.pathname.split('/').pop().toLowerCase(); // Normalize

    // 🚀 FIX: if allowedPages is empty (not SENT from backend), derive from Role
    if (!sessionUser.allowedPages || sessionUser.allowedPages.length === 0) {
        const ROLE_DEFAULTS = {
            'manager': ['pos.html', 'dashboard.html', 'products.html', 'inventory.html', 'vendors.html', 'reports.html', 'expenses.html', 'customers.html', 'visits.html', 'salesmen.html', 'register.html', 'backup.html'],
            'inventory_manager': ['products.html', 'inventory.html', 'vendors.html', 'expenses.html', 'dashboard.html'],
            'cashier': ['pos.html', 'customers.html', 'dashboard.html'],
            'technician': ['visits.html', 'upcoming-visits.html', 'customers.html', 'dashboard.html'],
            'salesman': ['pos.html', 'customers.html', 'dashboard.html']
        };
        const roleKey = (sessionUser.role || '').toLowerCase();
        sessionUser.allowedPages = ROLE_DEFAULTS[roleKey] || [];
        // If still empty and role exists, maybe give basic access?
        if (sessionUser.allowedPages.length === 0 && roleKey) {
            // Fallback: if role is unknown but not admin, they might be stuck. 
            // Assume they can access POS at least.
            sessionUser.allowedPages = ['pos.html'];
        }
    }

    // Default to empty array if undefined
    const allowed = (sessionUser.allowedPages || []).map(p => p.toLowerCase());

    console.log(`🔒 Enforcement: User=${sessionUser.username}, Path=${path}, Allowed=${JSON.stringify(allowed)}`);

    // Secured Pages List
    const securedPages = [
        'visits.html',
        'vendors.html',
        'customers.html',
        'products.html',
        'receipts.html',
        'reports.html',
        'salesmen.html',
        'expenses.html',
        'admin.html',
        'backup.html',
        'upcoming-visits.html'
    ];

    // If current page is secured, STRICTLY check if it's in the allowed list
    if (securedPages.includes(path)) {
        if (!allowed.includes(path)) {
            console.warn('⛔ Access Denied');
            alert('Access Denied: You do not have permission for this page. \nContact Admin.');

            // Redirect logic: Find first allowed secured page, or go to index/pos
            const firstAllowed = sessionUser.allowedPages && sessionUser.allowedPages.length > 0
                ? sessionUser.allowedPages[0]
                : 'index.html';

            window.location.href = firstAllowed;
            return;
        }
    }

    // 3. Hide Navigation Links (UI Polish)
    const navLinks = document.querySelectorAll('.nav-item');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const linkPath = href.split('/').pop().toLowerCase();
            if (securedPages.includes(linkPath)) {
                if (!allowed.includes(linkPath)) {
                    link.style.display = 'none';
                }
            }
        }
    });
}


// === Dynamic Roles Management ===
const defaultRoles = [
    { name: 'admin', level: 10, label: 'Admin' }
];

function getSystemRoles() {
    if (EnhancedSecurity.isSystemActivated()) {
        const stored = EnhancedSecurity.getSecureData('shop_roles');
        return (stored && stored.length > 0) ? stored : defaultRoles;
    }
    const local = localStorage.getItem('pos_roles');
    return local ? JSON.parse(local) : defaultRoles;
}

function saveSystemRoles(roles) {
    if (EnhancedSecurity.isSystemActivated()) {
        return EnhancedSecurity.storeSecureData('shop_roles', roles);
    }
    localStorage.setItem('pos_roles', JSON.stringify(roles));
    return true;
}

// Initial Load with Race Condition Protection
if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => {
        // Wait for system data to be ready before enforcing
        if (window.SystemReady) {
            enforcePagePermissions();
        } else {
            // Failsafe: If event already fired or we missed it, 
            // the event listener might hang. But usually SystemReady flag handles that.
            window.addEventListener('SystemDataReady', enforcePagePermissions);
        }
    });
}

// Export functions for global use
window.EnhancedSecurity = EnhancedSecurity;
window.login = login;
window.logout = logout;
window.getCurrentUser = getCurrentUser;
window.hasPermission = hasPermission;
window.canEditProducts = canEditProducts;
window.canManageUsers = canManageUsers;
window.canProcessReturns = canProcessReturns;
window.canViewReports = canViewReports;
window.canDeleteSales = canDeleteSales;
window.canManageVisits = canManageVisits;
window.getActiveUsers = getActiveUsers;
window.addUser = addUser;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.changePassword = changePassword;
window.isSessionValid = isSessionValid;
window.getUserActivity = getUserActivity;
window.getSystemRoles = getSystemRoles;
window.saveSystemRoles = saveSystemRoles;
