// 🚀 Tauri Adapter for Tashgheel POS
// Bridges legacy window.electronAPI calls to Tauri v2 Rust Commands
(function () {
    if (window.electronAPI) {
        console.warn('Tauri Adapter: electronAPI already exists, skipping.');
        return;
    }

    // Check for Tauri environment
    if (!window.__TAURI__) {
        console.error('Tauri Adapter: window.__TAURI__ is missing! Ensure "withGlobalTauri": true in tauri.conf.json');
        return;
    }

    const { invoke } = window.__TAURI__.core;

    console.log('🔄 Initializing Electron-to-Tauri Bridge...');

    window.electronAPI = {
        // Helper to get full path
        _getPath: async (filename) => {
            const path = window.__TAURI__.path;
            const appDataDir = await path.appLocalDataDir();
            if (!filename.includes('.')) filename += '.json';
            return await path.join(appDataDir, filename);
        },

        // Machine Identity
        getMachineId: async () => {
            try {
                const fs = window.__TAURI__.fs;
                const path = window.__TAURI__.path;
                const appDataDir = await path.appLocalDataDir();
                const machineIdPath = await path.join(appDataDir, 'machine_id.txt');

                if (await fs.exists(machineIdPath)) {
                    return await fs.readTextFile(machineIdPath);
                } else {
                    const newId = crypto.randomUUID();
                    await fs.writeTextFile(machineIdPath, newId);
                    return newId;
                }
            } catch (e) {
                console.error("getMachineId logic failed:", e);
                // Logic failing usually means FS permissions issues, but we fixed those.
                // Or window.__TAURI__.fs is undefined (unlikely given previous success).
                throw e;
            }
        },

        // Backup Operations
        selectBackupFolder: async () => {
            const { invoke } = window.__TAURI__.core;
            return await invoke('plugin:dialog|open', { directory: true });
        },
        saveBackupFile: async (folderPath, filename, data) => {
            const fs = window.__TAURI__.fs;
            const path = window.__TAURI__.path;
            try {
                const fullPath = await path.join(folderPath, filename);
                await fs.writeTextFile(fullPath, data);
                return { success: true, path: fullPath };
            } catch (e) { return { success: false, error: e }; }
        },
        checkFileExists: async (folderPath, filename) => {
            const fs = window.__TAURI__.fs;
            const path = window.__TAURI__.path;
            try {
                const fullPath = await path.join(folderPath, filename);
                return await fs.exists(fullPath);
            } catch (e) { return false; }
        },

        // Data Storage Operations
        ensureDataDir: async () => {
            const fs = window.__TAURI__.fs;
            const path = window.__TAURI__.path;
            const appDataDir = await path.appLocalDataDir();
            if (!await fs.exists(appDataDir)) {
                await fs.mkdir(appDataDir, { recursive: true });
            }
            return true;
        },

        saveData: async (key, value) => {
            const fs = window.__TAURI__.fs;
            try {
                await window.electronAPI.ensureDataDir();
                const path = await window.electronAPI._getPath(key);
                const payload = typeof value === 'string' ? value : JSON.stringify(value);
                await fs.writeTextFile(path, payload);
                return { success: true };
            } catch (err) { return { success: false, error: err }; }
        },

        readData: async (key) => {
            const fs = window.__TAURI__.fs;
            if (!key) return null;
            try {
                const path = await window.electronAPI._getPath(key);
                if (await fs.exists(path)) {
                    return await fs.readTextFile(path);
                }
                return null;
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

        listDataFiles: async () => { return []; },
        clearAllData: async () => { return false; },
        openDevTools: async () => {
            const { invoke } = window.__TAURI__.core;
            invoke('open_devtools').catch(e => console.log('DevTools not available via command'));
        }
    };

    // Override global confirm with async version
    window.confirm = window.showConfirm;

    console.log('✅ Tauri Adapter Ready: Legacy Electron API is now powered by Rust 🦀');

    // === GLOBAL ASYNC CONFIRMATION UTILITY ===
    // Replaces window.confirm() which is non-blocking/broken in some Tauri contexts

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

                btnContainer.appendChild(btnNo); // Cancel first (left) or second based on pref, usually right is primary
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

            // Clean up old listeners (cloning is a quick hack to wipe listeners)
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

            // Allow Escape key to cancel
            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', keyHandler);
                    close(false);
                }
            };
            document.addEventListener('keydown', keyHandler);

            // 3. Show
            overlay.style.display = 'flex';
            // Force reflow
            void overlay.offsetWidth;
            overlay.style.opacity = '1';
            overlay.firstChild.style.transform = 'scale(1)';
            newYes.focus();
        });
    };

    // Override global confirm with async version AFTER it is defined
    window.confirm = window.showConfirm;

    // === DEVTOOLS SHORTCUTS ===
    window.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
            console.log('🛠️ Opening DevTools via shortcut...');
            invoke('open_devtools').catch(err => console.error('Failed to open DevTools:', err));
        }
    });

    // === DATA CLEARING HELPER (For DevTools) ===
    window.clearData = async (key) => {
        if (!key) {
            console.log('Usage: clearData("customers") or clearData("all")');
            const files = await window.electronAPI.listDataFiles();
            console.log('Available keys:', files);
            return;
        }

        const confirmReset = await window.confirm(`Are you sure you want to clear ${key}?`);
        if (!confirmReset) return;

        if (key === 'all') {
            await window.electronAPI.clearAllData();
        } else {
            await window.EnhancedSecurity.storeSecureData(key, []);
        }
        location.reload();
    };

    console.log('✅ Tauri Adapter Ready: Legacy Electron API is now powered by Rust 🦀');
})();
