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
    async function apiFetch(url, options = {}) {
        const defaultOptions = {
            credentials: 'include',
            method: 'GET',
            headers: {}
        };

        const finalHeaders = { ...defaultOptions.headers, ...(options.headers || {}) };

        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: finalHeaders
        };

        // 🚀 SMART HEADERS: Only add Content-Type if there is a body 
        // AND it hasn't been explicitly set yet.
        // This prevents unnecessary OPTIONS preflight requests for simple GETs.
        if (finalOptions.body && !finalOptions.headers['Content-Type']) {
            finalOptions.headers['Content-Type'] = 'application/json';
        }

        try {
            return await fetch(url, finalOptions);
        } catch (err) {
            console.error('❌ apiFetch Network Error:', {
                url,
                options: finalOptions,
                error: err
            });
            throw err;
        }
    }

    window.electronAPI = {
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
                const response = await apiFetch(`${API_BASE}/data/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: filename.replace('.json', ''), value: data })
                });
                const result = await response.json();
                return { success: result.success, path: filename };
            } catch (e) { return { success: false, error: e }; }
        },
        checkFileExists: async (folderPath, filename) => {
            try {
                const response = await apiFetch(`${API_BASE}/file/exists`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folderPath, filename })
                });
                return await response.json();
            } catch (e) { return false; }
        },

        // Data Storage Operations
        ensureDataDir: async () => {
            const activeBranch = localStorage.getItem('activeBranchId') || 'bypass';
            await apiFetch(`${API_BASE}/utils/ensure-data-dir`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-branch-id': activeBranch
                }
            });
            return true;
        },

        saveData: async (key, value) => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const cleanKey = key.replace('.json', '');
                const response = await apiFetch(`${API_BASE}/data/save`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-branch-id': branchId
                    },
                    body: JSON.stringify({ key: cleanKey, value: value })
                });
                const result = await response.json();
                if (!result.success) throw new Error(result.error);
                return { success: true };
            } catch (err) { return { success: false, error: err }; }
        },

        readData: async (key) => {
            if (!key) return null;
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const cleanKey = key.replace('.json', '');
                const response = await apiFetch(`${API_BASE}/data/read/${cleanKey}`, {
                    method: 'GET',
                    headers: {
                        'x-branch-id': branchId
                    }
                });
                if (!response.ok) return null;
                const text = await response.text();
                return text || null;
            } catch (e) { console.error("readData error", e); return null; }
        },

        // Sales Specific Operation
        saveSale: async (sale) => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const response = await apiFetch(`${API_BASE}/sales`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-branch-id': branchId
                    },
                    body: JSON.stringify(sale)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Sale failed');
                return { success: true, id: result.id };
            } catch (err) { return { success: false, error: err }; }
        },

        // Inventory Operation
        updateStock: async (productId, qty) => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const response = await apiFetch(`${API_BASE}/inventory/set`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-branch-id': branchId
                    },
                    body: JSON.stringify({ productId, qty })
                });
                const result = await response.json();
                return result;
            } catch (err) { return { success: false, error: err }; }
        },

        // Reporting
        getLiveReport: async () => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const response = await apiFetch(`${API_BASE}/reports/live`, {
                    method: 'GET',
                    headers: { 'x-branch-id': branchId }
                });
                return await response.json();
            } catch (err) { return null; }
        },

        getSalesHistory: async (filters = {}) => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const params = new URLSearchParams(filters).toString();
                const response = await apiFetch(`${API_BASE}/reports/history?${params}`, {
                    method: 'GET',
                    headers: { 'x-branch-id': branchId }
                });
                return await response.json();
            } catch (err) { return { sales: [], total: 0 }; }
        },

        getCurrentShift: async () => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const response = await apiFetch(`${API_BASE}/shifts/current`, {
                    method: 'GET',
                    headers: { 'x-branch-id': branchId }
                });
                return await response.json();
            } catch (err) { return null; }
        },

        openShift: async (openingCash) => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const response = await apiFetch(`${API_BASE}/shifts/open`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-branch-id': branchId
                    },
                    body: JSON.stringify({ openingCash })
                });
                return await response.json();
            } catch (err) { return { error: err.message }; }
        },

        closeShift: async (shiftId, closingCash, notes) => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const response = await apiFetch(`${API_BASE}/shifts/close`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-branch-id': branchId
                    },
                    body: JSON.stringify({ shiftId, closingCash, notes })
                });
                return await response.json();
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

        listDataFiles: async () => {
            try {
                const branchId = localStorage.getItem('activeBranchId') || 'bypass';
                const response = await apiFetch(`${API_BASE}/data/list`, {
                    method: 'GET',
                    headers: {
                        'x-branch-id': branchId
                    }
                });
                if (!response.ok) {
                    console.error('listDataFiles failed:', response.status, response.statusText);
                    return [];
                }
                return await response.json();
            } catch (e) {
                console.error('listDataFiles exception:', e);
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
