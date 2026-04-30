// 🚀 Web Adapter for Tashgheel Web App
// Bridges legacy window.electronAPI calls to Node.js Backend API
(function () {
    if (window.electronAPI) {
        console.warn('Web Adapter: electronAPI already exists, skipping.');
        return;
    }

    const API_BASE = window.location.origin + '/api';

    console.log('🌐 Initializing Web Adapter with API_BASE:', API_BASE);

    // Helper: Enforce credentials and standardize requests
    // Helper: Enforce credentials and standardize requests
    // Helper: Enforce credentials and standardize requests
    async function apiFetch(path, options = {}) {
        const branchId = localStorage.getItem("activeBranchId");

        const fetchOptions = {
            method: options.method || "GET",
            credentials: "include",
            headers: {}
        };

        // ONLY attach content-type if body exists (Avoids Preflight OPTIONS on GET)
        if (options.body) {
            fetchOptions.headers["Content-Type"] = "application/json";
            fetchOptions.body = options.body;
        }

        if (branchId && branchId !== "bypass") {
            fetchOptions.headers["x-branch-id"] = branchId;
        }

        try {
            // Ensure path starts with /
            const safePath = path.startsWith('/') ? path : '/' + path;
            const response = await fetch(API_BASE + safePath, fetchOptions);

            if (!response.ok) {
                // 🟢 401 Interceptor: Attempt Silent Refresh
                if (response.status === 401 && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
                    console.log('🔄 401 Unauthorized detected. Attempting token refresh...');
                    try {
                        const refreshResponse = await fetch(API_BASE + '/auth/refresh', {
                            method: 'GET',
                            credentials: 'include'
                        });

                        if (refreshResponse.ok) {
                            console.log('✅ Token Refreshed Successfully. Retrying original request...');
                            // Retry Original Request
                            const retryResponse = await fetch(API_BASE + safePath, fetchOptions);
                            if (retryResponse.ok) {
                                const text = await retryResponse.text();
                                if (!text) return null;
                                return JSON.parse(text);
                            }
                            // If retry fails, fall through to throw error
                        } else {
                            console.warn('❌ Token Refresh Failed. Session expired.');
                        }
                    } catch (refreshErr) {
                        console.error('⚠️ Error during token refresh attempt:', refreshErr);
                    }
                }

                const text = await response.text();
                throw new Error(text || response.status);
            }

            // 🔒 SAFETY: Some endpoints return empty body
            const text = await response.text();
            if (!text) return null;
            return JSON.parse(text);

        } catch (err) {
            console.error("❌ apiFetch Network Error:", {
                url: API_BASE + path,
                options: fetchOptions,
                error: err
            });
            throw err;
        }
    }

    window.apiFetch = apiFetch; // 🌍 Expose Globally

    window.electronAPI = {
        isWebAdapter: true, // Flag to identify Web Adapter
        // Helper to get full path - In web, this is just the key name usually, managed by server
        _getPath: async (filename) => {
            return filename; // Server handles paths
        },

        // Machine Identity (REMOVED: Managed by Super Admin Dashboard)
        getMachineId: async () => {
            return 'web-client';
        },

        // Backup Operations (Limited in Web)
        selectBackupFolder: async () => {
            alert('Backup folder selection is managed by the server in Web Mode.');
            return 'server/backups'; // Dummy path
        },
        saveBackupFile: async (folderPath, filename, data) => {
            try {
                const result = await apiFetch(`/data/save`, {
                    method: 'POST',
                    body: JSON.stringify({ key: filename.replace('.json', ''), value: data })
                });
                return { success: result.success, path: filename };
            } catch (e) { return { success: false, error: e }; }
        },
        checkFileExists: async (folderPath, filename) => {
            try {
                return await apiFetch(`/file/exists`, {
                    method: 'POST',
                    body: JSON.stringify({ folderPath, filename })
                });
            } catch (e) { return false; }
        },

        // Data Storage Operations
        ensureDataDir: async () => {
            const activeBranch = localStorage.getItem('activeBranchId');
            if (!activeBranch || activeBranch === 'bypass') return true;

            // branchId is auto-injected by apiFetch
            await apiFetch(`/utils/ensure-data-dir`, { method: 'POST' });
            return true;
        },

        saveData: async (key, value) => {
            try {
                const cleanKey = key.replace('.json', '');
                const result = await apiFetch(`/data/save`, {
                    method: 'POST',
                    body: JSON.stringify({ key: cleanKey, value: value })
                });
                if (!result.success) throw new Error(result.error);
                return { success: true };
            } catch (err) { return { success: false, error: err }; }
        },

        readData: async (key) => {
            if (!key) return null;
            try {
                const branchId = localStorage.getItem('activeBranchId');
                if (!branchId || branchId === 'bypass') return null;

                // Ensure key is clean (backend expects filename without extension for read)
                // Actually user said: `return await apiFetch("/data/read/" + key);`
                // But previous code was explicit about cleaning. I will clean it to be safe.
                const cleanKey = key.replace('.json', '');
                return await apiFetch(`/data/read/${cleanKey}`);
            } catch (e) { console.error("readData error", e); return null; }
        },

        // Sales Specific Operation
        // Sales Specific Operation
        saveSale: async (sale) => {
            try {
                // apiFetch throws if not ok
                const result = await apiFetch(`/sales`, {
                    method: 'POST',
                    body: JSON.stringify(sale)
                });
                return { success: true, id: result.id };
            } catch (err) { return { success: false, error: err }; }
        },

        // Inventory Operation
        updateStock: async (productId, qty) => {
            try {
                return await apiFetch(`/inventory/set`, {
                    method: 'POST',
                    body: JSON.stringify({ productId, qty })
                });
            } catch (err) { return { success: false, error: err }; }
        },

        // Reporting
        // Reporting
        getLiveReport: async () => {
            try {
                return await apiFetch(`/reports/live`);
            } catch (err) { return null; }
        },

        // --- Parties (Vendors & Customers) ---
        getVendors: async () => {
            try {
                return await apiFetch(`/parties/vendors`);
            } catch (err) { return []; }
        },
        saveVendor: async (vendor) => {
            try {
                return await apiFetch(`/parties/vendors`, { method: 'POST', body: JSON.stringify(vendor) });
            } catch (err) { return { success: false, error: err }; }
        },
        deleteVendor: async (id) => {
            try {
                return await apiFetch(`/parties/vendors/${id}`, { method: 'DELETE' });
            } catch (err) { return { success: false, error: err }; }
        },

        getCustomers: async () => {
            try {
                return await apiFetch(`/parties/customers`);
            } catch (err) { return []; }
        },
        saveCustomer: async (customer) => {
            try {
                return await apiFetch(`/parties/customers`, { method: 'POST', body: JSON.stringify(customer) });
            } catch (err) { return { success: false, error: err }; }
        },
        deleteCustomer: async (id) => {
            try {
                return await apiFetch(`/parties/customers/${id}`, { method: 'DELETE' });
            } catch (err) { return { success: false, error: err }; }
        },

        getSalesHistory: async (filters = {}) => {
            try {
                // Engine expects ALL data for aggregation. We set a high limit.
                if (!filters.limit) filters.limit = 5000;
                const params = new URLSearchParams(filters).toString();

                const result = await apiFetch(`/reports/history?${params}`);

                // Backend returns { sales: [], total: ..., summary: ... }
                // Engine expects Array [ ...sales ]
                if (result && result.sales && Array.isArray(result.sales)) {
                    return result.sales;
                }

                return Array.isArray(result) ? result : [];
            } catch (err) { return []; }
        },

        getCurrentShift: async () => {
            try {
                return await apiFetch(`/shifts/current`);
            } catch (err) { return null; }
        },

        getActiveBranchShifts: async () => {
            try {
                return await apiFetch(`/shifts/active-branch`);
            } catch (err) { return []; }
        },

        openShift: async (openingCash) => {
            try {
                return await apiFetch(`/shifts/open`, {
                    method: 'POST',
                    body: JSON.stringify({ openingCash })
                });
            } catch (err) { return { error: err.message }; }
        },

        joinShift: async (shiftId) => {
            try {
                return await apiFetch(`/shifts/join`, {
                    method: 'POST',
                    body: JSON.stringify({ shiftId })
                });
            } catch (err) { return { success: false, error: err.message }; }
        },

        closeShift: async (shiftId, closingCash, notes) => {
            try {
                return await apiFetch(`/shifts/close`, {
                    method: 'POST',
                    body: JSON.stringify({ shiftId, closingCash, notes })
                });
            } catch (err) { return { error: err.message }; }
        },

        // Aliases
        writeJson: async (filename, content) => {
            return await window.electronAPI.saveData(filename, content);
        },
        readJson: async (filename) => {
            const data = await window.electronAPI.readData(filename);
            if (!data) return null;
            try { return JSON.parse(data); } catch (e) { return { value: data }; }
        },

        listDataFiles: async (branchIdOverride) => {
            const branchId = branchIdOverride || localStorage.getItem('activeBranchId');

            if (!branchId || branchId === 'bypass') {
                console.warn("⚠️ listDataFiles skipped (no branch or bypass)");
                return [];
            }

            try {
                // Query which keys exist for this tenant so auth.js can load them
                const result = await apiFetch(`/data/list`);
                // Ensure we return plain strings only (guard against object responses)
                if (Array.isArray(result)) {
                    return result.map(item => {
                        if (typeof item === 'string') return item;
                        if (item && typeof item === 'object' && item.key) return String(item.key);
                        return null;
                    }).filter(Boolean);
                }
                // Endpoint missing or returned unexpected format — return empty so auth.js uses defaults
                return [];
            } catch (e) {
                // Endpoint not implemented — silently return empty, auth.js has hardcoded defaults
                return [];
            }
        },

        clearAllData: async () => { return false; }, // Not implemented for safety
        openDevTools: async () => {
            console.log('DevTools is controlled by the browser in Web App mode. Press F12.');
        }
    };

    // Override global confirm with async version (reusing the UI from tauri-adapter if present in styles, 
    // but the logic was in tauri-adapter.js. We need to copy that UI logic here too!)

    // === GLOBAL ASYNC CONFIRMATION UTILITY ===
    // (Copied from tauri-adapter.js to ensure UI consistency)
    window.showConfirm = function (message) {
        return new Promise((resolve) => {
            // 1. Create Modal Elements
            const overlayId = 'custom-confirm-overlay';
            let overlay = document.getElementById(overlayId);

            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = overlayId;
                overlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5); z-index: 10000;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; transition: opacity 0.2s ease;
                `;

                const box = document.createElement('div');
                box.className = 'confirm-box';
                box.style.cssText = `
                    background: white; padding: 25px; border-radius: 8px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    text-align: center; min-width: 320px; max-width: 400px;
                    transform: scale(0.9); transition: transform 0.2s ease;
                `;

                const text = document.createElement('p');
                text.id = 'custom-confirm-text';
                text.style.cssText = 'font-size: 1.1em; color: #2c3e50; margin-bottom: 25px; line-height: 1.5;';

                const btnContainer = document.createElement('div');
                btnContainer.style.cssText = 'display: flex; justify-content: center; gap: 15px;';

                const btnYes = document.createElement('button');
                btnYes.id = 'custom-confirm-yes';
                btnYes.textContent = '✅ Yes, Confirm';
                btnYes.style.cssText = `
                    padding: 10px 25px; background: #27ae60; color: white; border: none;
                    border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 1em;
                    transition: background 0.2s;
                `;
                btnYes.onmouseover = () => btnYes.style.background = '#219150';
                btnYes.onmouseout = () => btnYes.style.background = '#27ae60';

                const btnNo = document.createElement('button');
                btnNo.id = 'custom-confirm-no';
                btnNo.textContent = '❌ Cancel';
                btnNo.style.cssText = `
                    padding: 10px 25px; background: #95a5a6; color: white; border: none;
                    border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 1em;
                    transition: background 0.2s;
                `;
                btnNo.onmouseover = () => btnNo.style.background = '#7f8c8d';
                btnNo.onmouseout = () => btnNo.style.background = '#95a5a6';

                btnContainer.appendChild(btnNo);
                btnContainer.appendChild(btnYes);

                box.appendChild(text);
                box.appendChild(btnContainer);
                overlay.appendChild(box);
                document.body.appendChild(overlay);
            }

            // 2. Set Content & Handlers
            const textEl = document.getElementById('custom-confirm-text');
            const btnYes = document.getElementById('custom-confirm-yes');
            const btnNo = document.getElementById('custom-confirm-no');

            textEl.textContent = message || 'Are you sure?';

            const newYes = btnYes.cloneNode(true);
            const newNo = btnNo.cloneNode(true);
            btnYes.parentNode.replaceChild(newYes, btnYes);
            btnNo.parentNode.replaceChild(newNo, btnNo);

            const close = (result) => {
                overlay.style.opacity = '0';
                overlay.firstChild.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    overlay.style.display = 'none';
                    resolve(result);
                }, 200);
            };

            newYes.addEventListener('click', () => close(true));
            newNo.addEventListener('click', () => close(false));

            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', keyHandler);
                    close(false);
                }
            };
            document.addEventListener('keydown', keyHandler);

            // 3. Show
            overlay.style.display = 'flex';
            void overlay.offsetWidth;
            overlay.style.opacity = '1';
            overlay.firstChild.style.transform = 'scale(1)';
            newYes.focus();
        });
    };

    window.confirm = window.showConfirm;

    console.log('✅ Web Adapter Ready: API bridged to Node.js backend');
})();
