// 🚀 Web Adapter for Tashgheel Web App
// Bridges legacy window.electronAPI calls to Node.js Backend API
(function () {
    if (window.electronAPI) {
        console.warn('Web Adapter: electronAPI already exists, skipping.');
        return;
    }

    const API_BASE = '/api';

    console.log('🌐 Initializing Web Adapter...');

    window.electronAPI = {
        // Helper to get full path - In web, this is just the key name usually, managed by server
        _getPath: async (filename) => {
            return filename; // Server handles paths
        },

        // Machine Identity
        getMachineId: async () => {
            try {
                const response = await fetch(`${API_BASE}/machine-id`);
                if (!response.ok) throw new Error('Failed to get machine ID');
                const text = await response.text();
                return text;
            } catch (e) {
                console.error("getMachineId logic failed:", e);
                return 'web-client-' + Math.random().toString(36).substring(7);
            }
        },

        // Backup Operations (Limited in Web)
        selectBackupFolder: async () => {
            alert('Backup folder selection is managed by the server in Web Mode.');
            return 'server/backups'; // Dummy path
        },
        saveBackupFile: async (folderPath, filename, data) => {
            // Re-use save data for now, or implement specific backup endpoint?
            // To be safe, we'll just save it as a data key for now to prevent errors
            // or we could add a backup endpoint later.
            // For now, let's treat it as a regular file save in data dir
            try {
                const response = await fetch(`${API_BASE}/data/save`, {
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
                const response = await fetch(`${API_BASE}/file/exists`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folderPath, filename })
                });
                return await response.json();
            } catch (e) { return false; }
        },

        // Data Storage Operations
        ensureDataDir: async () => {
            await fetch(`${API_BASE}/utils/ensure-data-dir`, { method: 'POST' });
            return true;
        },

        saveData: async (key, value) => {
            try {
                // Ensure key doesn't have .json for the API if it adds it, 
                // but if the code passes "users.json", we should strip it if the server adds it.
                // Our server adds .json.
                const cleanKey = key.replace('.json', '');

                const response = await fetch(`${API_BASE}/data/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                const cleanKey = key.replace('.json', '');
                const response = await fetch(`${API_BASE}/data/read/${cleanKey}`);
                if (!response.ok) return null;
                const text = await response.text();
                return text || null; // Return empty string as null or raw string
            } catch (e) { console.error("readData error", e); return null; }
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
                const response = await fetch(`${API_BASE}/data/list`);
                if (!response.ok) return [];
                return await response.json();
            } catch (e) { return []; }
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
