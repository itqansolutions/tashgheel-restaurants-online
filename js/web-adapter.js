// 🚀 Web Adapter for Tashgheel Web App
// Bridges legacy window.electronAPI calls to Node.js Backend API
(function () {
    if (window.electronAPI) {
        console.warn('Web Adapter: electronAPI already exists, skipping.');
        return;
    }

    const API_BASE = window.location.origin + '/api';

    console.log('🌐 Initializing Web Adapter with API_BASE:', API_BASE);

    // === OFFLINE-FIRST SYNC ENGINE ===
    async function pingServer() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(API_BASE + '/data/list', {
                method: 'GET',
                credentials: 'include',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return true;
        } catch (e) {
            return false;
        }
    }

    function replaceOfflineIds(str, mappings) {
        if (typeof str !== 'string') return str;
        let result = str;
        Object.entries(mappings).forEach(([offlineId, realId]) => {
            result = result.split(offlineId).join(realId);
        });
        return result;
    }

    function enqueueOfflineRequest(path, options, tempId = null) {
        const queue = JSON.parse(localStorage.getItem('pos_offline_queue') || '[]');
        queue.push({
            path,
            method: options.method || 'GET',
            body: options.body || null,
            tempId: tempId,
            timestamp: Date.now()
        });
        localStorage.setItem('pos_offline_queue', JSON.stringify(queue));
        updateOfflineUI();
    }

    function updateOfflineUI() {
        const queue = JSON.parse(localStorage.getItem('pos_offline_queue') || '[]');
        const isOffline = localStorage.getItem('pos_is_offline') === 'true';

        let el = document.getElementById('offline-sync-badge');
        if (!el) {
            el = document.createElement('div');
            el.id = 'offline-sync-badge';
            el.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; z-index: 100000;
                padding: 10px 18px; border-radius: 30px; font-size: 11px; font-weight: 900;
                display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.25);
                transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); font-family: sans-serif;
                text-transform: uppercase; letter-spacing: 0.05em; pointer-events: none;
                backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1);
            `;
            document.body.appendChild(el);
        }

        if (isOffline) {
            el.style.background = 'rgba(225, 29, 72, 0.9)'; // rose-600
            el.style.color = '#ffffff';
            el.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#fff; animation: pulse 1s infinite;"></span> Offline Mode ${queue.length > 0 ? `(${queue.length} pending)` : ''}`;
            el.style.transform = 'translateY(0) scale(1)';
            el.style.opacity = '1';
            el.style.display = 'flex';
        } else if (queue.length > 0) {
            el.style.background = 'rgba(234, 179, 8, 0.9)'; // yellow-500
            el.style.color = '#000000';
            el.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#000; animation: spin 1s linear infinite;"></span> Syncing... (${queue.length} left)`;
            el.style.transform = 'translateY(0) scale(1)';
            el.style.opacity = '1';
            el.style.display = 'flex';
        } else {
            el.style.background = 'rgba(34, 197, 94, 0.9)'; // green-500
            el.style.color = '#ffffff';
            el.innerHTML = `✅ Connected & Synced`;
            el.style.transform = 'translateY(0) scale(1)';
            el.style.opacity = '1';
            el.style.display = 'flex';
            
            if (el.timeoutId) clearTimeout(el.timeoutId);
            el.timeoutId = setTimeout(() => {
                el.style.transform = 'translateY(20px) scale(0.9)';
                el.style.opacity = '0';
                setTimeout(() => {
                    if (localStorage.getItem('pos_is_offline') !== 'true' && JSON.parse(localStorage.getItem('pos_offline_queue') || '[]').length === 0) {
                        el.style.display = 'none';
                    }
                }, 400);
            }, 3000);
        }
    }

    // Helper: get tenant-scoped backup key (mirrors auth.js logic)
    function _getOfflineBackupKey(key) {
        const GLOBAL_KEYS = ['session', 'license'];
        if (GLOBAL_KEYS.includes(key)) return 'pos_backup_' + key;
        const tenantId = localStorage.getItem('tenant_id') || 'default';
        return `pos_backup_${tenantId}_${key}`;
    }

    async function handleOfflineRequest(path, options) {
        const cleanPath = path.startsWith('/') ? path : '/' + path;
        const urlParts = cleanPath.split('?')[0].split('/');
        const method = (options.method || 'GET').toUpperCase();
        
        console.log(`[OFFLINE_SIMULATOR] Simulating ${method} ${cleanPath}`);

        // GET /auth/me — return session from localStorage
        if (method === 'GET' && (cleanPath.startsWith('/auth/me') || cleanPath.startsWith('/auth/refresh'))) {
            const session = JSON.parse(localStorage.getItem('pos_backup_session') || 'null');
            if (session) return session;
            // Build minimal user object from localStorage
            const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (user) return user;
            throw new Error('offline_no_session');
        }

        // POST /auth/login — offline login not supported
        if (method === 'POST' && cleanPath.startsWith('/auth/login')) {
            throw new Error('Cannot log in while offline. Please restore your internet connection.');
        }

        // GET /data/list — return list of known cached keys
        if (method === 'GET' && cleanPath.startsWith('/data/list')) {
            const tenantId = localStorage.getItem('tenant_id') || 'default';
            const knownKeys = [
                'users', 'products', 'customers', 'vendors', 'visits', 'sales',
                'returns', 'expenses', 'shop_settings', 'license', 'spare_parts',
                'vehicles', 'vendor_payments', 'employees', 'ingredients',
                'vendor_transactions', 'tables', 'delivery_areas', 'salesmen',
                'taxes', 'settings'
            ];
            // Return only keys that actually have data cached
            return knownKeys.filter(k => {
                const bk = _getOfflineBackupKey(k);
                return !!localStorage.getItem(bk);
            });
        }

        // GET /data/read/:key — serve from localStorage backup
        if (method === 'GET' && cleanPath.startsWith('/data/read/')) {
            const key = urlParts[3];
            if (!key) return null;
            // 1. Try in-memory DataCache first (mid-session offline without refresh)
            if (window.DataCache && window.DataCache[key] !== undefined && window.DataCache[key] !== null) {
                const val = window.DataCache[key];
                return JSON.stringify(Array.isArray(val) ? val : val);
            }
            // 2. Try localStorage backup (offline after page refresh)
            const bk = _getOfflineBackupKey(key);
            const stored = localStorage.getItem(bk);
            if (stored) {
                try { return JSON.stringify(JSON.parse(stored)); }
                catch(e) { return stored; }
            }
            return null;
        }

        // POST /data/save — save to localStorage only
        if (method === 'POST' && cleanPath.startsWith('/data/save')) {
            try {
                const body = options.body ? JSON.parse(options.body) : {};
                if (body.key) {
                    const bk = _getOfflineBackupKey(body.key);
                    localStorage.setItem(bk, JSON.stringify(body.value));
                    // Also update DataCache if available
                    if (window.DataCache) window.DataCache[body.key] = body.value;
                }
                return { success: true };
            } catch(e) { return { success: false }; }
        }

        // GET /tables — serve from backup
        if (method === 'GET' && cleanPath.startsWith('/tables')) {
            const bk = _getOfflineBackupKey('tables');
            const stored = localStorage.getItem(bk);
            return stored ? JSON.parse(stored) : [];
        }

        // GET /taxes — serve from backup
        if (method === 'GET' && cleanPath.startsWith('/taxes')) {
            const bk = _getOfflineBackupKey('taxes');
            const stored = localStorage.getItem(bk);
            return stored ? JSON.parse(stored) : [];
        }

        // GET /shifts/current
        if (method === 'GET' && cleanPath.startsWith('/shifts/current')) {
            const currentShift = JSON.parse(localStorage.getItem('pos_current_shift') || 'null');
            return currentShift;
        }

        // POST /shifts/open
        if (method === 'POST' && cleanPath.startsWith('/shifts/open')) {
            const body = options.body ? JSON.parse(options.body) : {};
            const shiftId = 'SHIFT-OFFLINE-' + Date.now();
            const currentShift = {
                id: shiftId,
                _id: shiftId,
                openedAt: new Date().toISOString(),
                closedAt: null,
                openingCash: parseFloat(body.openingCash || 0),
                expectedCash: parseFloat(body.openingCash || 0),
                closingCash: 0,
                difference: 0,
                status: 'open',
                cashier: JSON.parse(localStorage.getItem('currentUser') || '{}'),
                notes: ''
            };
            localStorage.setItem('pos_current_shift', JSON.stringify(currentShift));

            const history = JSON.parse(localStorage.getItem('pos_shift_history') || '[]');
            history.unshift(currentShift);
            localStorage.setItem('pos_shift_history', JSON.stringify(history));

            enqueueOfflineRequest(path, options, shiftId);
            return { success: true, shift: currentShift };
        }

        // POST /shifts/join
        if (method === 'POST' && cleanPath.startsWith('/shifts/join')) {
            enqueueOfflineRequest(path, options);
            return { success: true };
        }

        // POST /shifts/close
        if (method === 'POST' && cleanPath.startsWith('/shifts/close')) {
            const body = options.body ? JSON.parse(options.body) : {};
            const currentShift = JSON.parse(localStorage.getItem('pos_current_shift') || 'null');
            if (currentShift) {
                currentShift.closedAt = new Date().toISOString();
                currentShift.closingCash = parseFloat(body.closingCash || 0);
                currentShift.difference = currentShift.closingCash - currentShift.expectedCash;
                currentShift.notes = body.notes || '';
                currentShift.status = 'closed';

                const history = JSON.parse(localStorage.getItem('pos_shift_history') || '[]');
                const idx = history.findIndex(s => s.id === currentShift.id || s._id === currentShift.id);
                if (idx !== -1) {
                    history[idx] = currentShift;
                } else {
                    history.unshift(currentShift);
                }
                localStorage.setItem('pos_shift_history', JSON.stringify(history));
            }
            localStorage.removeItem('pos_current_shift');

            enqueueOfflineRequest(path, options);
            return { success: true };
        }

        // GET /shifts/history
        if (method === 'GET' && cleanPath.startsWith('/shifts/history')) {
            return JSON.parse(localStorage.getItem('pos_shift_history') || '[]');
        }

        // GET /shifts/active-branch
        if (method === 'GET' && cleanPath.startsWith('/shifts/active-branch')) {
            const current = JSON.parse(localStorage.getItem('pos_current_shift') || 'null');
            return current ? [current] : [];
        }

        // POST /sales
        if (method === 'POST' && cleanPath.startsWith('/sales')) {
            const sale = options.body ? JSON.parse(options.body) : {};
            if (!sale.id) sale.id = 'REC-OFFLINE-' + Date.now();
            if (!sale.receiptNo) sale.receiptNo = String(Date.now()).slice(-4);
            sale.createdAt = new Date().toISOString();

            const sales = JSON.parse(localStorage.getItem('pos_sales') || '[]');
            sales.unshift(sale);
            localStorage.setItem('pos_sales', JSON.stringify(sales));

            const currentShift = JSON.parse(localStorage.getItem('pos_current_shift') || 'null');
            if (currentShift) {
                if (sale.method === 'cash') {
                    currentShift.expectedCash += parseFloat(sale.total || 0);
                } else if (sale.method === 'split') {
                    currentShift.expectedCash += parseFloat(sale.splitCash || 0);
                }
                localStorage.setItem('pos_current_shift', JSON.stringify(currentShift));
                const history = JSON.parse(localStorage.getItem('pos_shift_history') || '[]');
                const idx = history.findIndex(s => s.id === currentShift.id);
                if (idx !== -1) {
                    history[idx] = currentShift;
                    localStorage.setItem('pos_shift_history', JSON.stringify(history));
                }
            }

            enqueueOfflineRequest(path, options, sale.id);
            return { success: true, id: sale.id, receiptNo: sale.receiptNo };
        }

        // POST /expenses
        if (method === 'POST' && cleanPath.startsWith('/expenses')) {
            const expense = options.body ? JSON.parse(options.body) : {};
            if (!expense.id) expense.id = 'EXP-OFFLINE-' + Date.now();
            expense.createdAt = new Date().toISOString();

            const expenses = JSON.parse(localStorage.getItem('pos_expenses') || '[]');
            expenses.unshift(expense);
            localStorage.setItem('pos_expenses', JSON.stringify(expenses));

            const currentShift = JSON.parse(localStorage.getItem('pos_current_shift') || 'null');
            if (currentShift && (expense.method || 'cash').toLowerCase() === 'cash') {
                currentShift.expectedCash -= parseFloat(expense.amount || 0);
                localStorage.setItem('pos_current_shift', JSON.stringify(currentShift));
                const history = JSON.parse(localStorage.getItem('pos_shift_history') || '[]');
                const idx = history.findIndex(s => s.id === currentShift.id);
                if (idx !== -1) {
                    history[idx] = currentShift;
                    localStorage.setItem('pos_shift_history', JSON.stringify(history));
                }
            }

            enqueueOfflineRequest(path, options, expense.id);
            return { success: true };
        }

        // GET /orders
        if (method === 'GET' && cleanPath === '/orders') {
            return JSON.parse(localStorage.getItem('pos_dinein_orders') || '[]');
        }

        // POST /orders
        if (method === 'POST' && cleanPath === '/orders') {
            const body = options.body ? JSON.parse(options.body) : {};
            const orderId = 'ORDER-OFFLINE-' + Date.now();
            
            let tableName = 'Table';
            const tablesBackup = window.EnhancedSecurity?.getSecureData('tables') || [];
            const table = tablesBackup.find(t => t.id === body.tableId || t._id === body.tableId);
            if (table) tableName = table.name;

            const order = {
                id: orderId,
                _id: orderId,
                tableId: body.tableId,
                tableName: tableName,
                items: [],
                isLocked: false,
                currentBatch: 0,
                version: 1,
                status: 'open',
                createdAt: new Date().toISOString(),
                lastActivityAt: new Date().toISOString()
            };

            const orders = JSON.parse(localStorage.getItem('pos_dinein_orders') || '[]');
            orders.push(order);
            localStorage.setItem('pos_dinein_orders', JSON.stringify(orders));

            enqueueOfflineRequest(path, options, orderId);
            return { success: true, order };
        }

        // GET /orders/:id
        if (method === 'GET' && cleanPath.startsWith('/orders/')) {
            const id = urlParts[2];
            const orders = JSON.parse(localStorage.getItem('pos_dinein_orders') || '[]');
            const order = orders.find(o => o.id === id || o._id === id);
            return order || null;
        }

        // PATCH /orders/:id/items
        if (method === 'PATCH' && cleanPath.startsWith('/orders/') && cleanPath.endsWith('/items')) {
            const id = urlParts[2];
            const body = options.body ? JSON.parse(options.body) : {};
            const orders = JSON.parse(localStorage.getItem('pos_dinein_orders') || '[]');
            const orderIdx = orders.findIndex(o => o.id === id || o._id === id);
            if (orderIdx !== -1) {
                const order = orders[orderIdx];
                body.items.forEach(newItem => {
                    const itemIdx = order.items.findIndex(i => i.lineId === newItem.lineId);
                    if (itemIdx !== -1) {
                        order.items[itemIdx] = { ...order.items[itemIdx], ...newItem };
                    } else {
                        order.items.push(newItem);
                    }
                });
                order.version = (body.version || order.version) + 1;
                order.lastActivityAt = new Date().toISOString();
                orders[orderIdx] = order;
                localStorage.setItem('pos_dinein_orders', JSON.stringify(orders));
                enqueueOfflineRequest(path, options);
                return { success: true, order };
            }
            throw new Error('Order not found');
        }

        // DELETE /orders/:id/items/:lineId
        if (method === 'DELETE' && cleanPath.startsWith('/orders/') && urlParts[3] === 'items') {
            const id = urlParts[2];
            const lineId = urlParts[4];
            const orders = JSON.parse(localStorage.getItem('pos_dinein_orders') || '[]');
            const orderIdx = orders.findIndex(o => o.id === id || o._id === id);
            if (orderIdx !== -1) {
                const order = orders[orderIdx];
                order.items = order.items.filter(i => i.lineId !== lineId);
                order.version += 1;
                order.lastActivityAt = new Date().toISOString();
                orders[orderIdx] = order;
                localStorage.setItem('pos_dinein_orders', JSON.stringify(orders));
                enqueueOfflineRequest(path, options);
                return { success: true };
            }
            throw new Error('Order not found');
        }

        // POST /orders/:id/send
        if (method === 'POST' && cleanPath.startsWith('/orders/') && cleanPath.endsWith('/send')) {
            const id = urlParts[2];
            const orders = JSON.parse(localStorage.getItem('pos_dinein_orders') || '[]');
            const orderIdx = orders.findIndex(o => o.id === id || o._id === id);
            if (orderIdx !== -1) {
                const order = orders[orderIdx];
                let count = 0;
                order.items.forEach(i => {
                    if (i.kitchenStatus === 'pending') {
                        i.kitchenStatus = 'sent';
                        i.sentAt = new Date().toISOString();
                        count++;
                    }
                });
                order.currentBatch += 1;
                order.lastActivityAt = new Date().toISOString();
                orders[orderIdx] = order;
                localStorage.setItem('pos_dinein_orders', JSON.stringify(orders));
                enqueueOfflineRequest(path, options);
                return { success: true, batchNo: order.currentBatch, sentCount: count };
            }
            throw new Error('Order not found');
        }

        // POST /orders/:id/lock
        if (method === 'POST' && cleanPath.startsWith('/orders/') && cleanPath.endsWith('/lock')) {
            const id = urlParts[2];
            const orders = JSON.parse(localStorage.getItem('pos_dinein_orders') || '[]');
            const orderIdx = orders.findIndex(o => o.id === id || o._id === id);
            if (orderIdx !== -1) {
                const order = orders[orderIdx];
                order.isLocked = true;
                order.lastActivityAt = new Date().toISOString();
                orders[orderIdx] = order;
                localStorage.setItem('pos_dinein_orders', JSON.stringify(orders));
                enqueueOfflineRequest(path, options);
                return { success: true };
            }
            throw new Error('Order not found');
        }

        // POST /orders/:id/close
        if (method === 'POST' && cleanPath.startsWith('/orders/') && cleanPath.endsWith('/close')) {
            const id = urlParts[2];
            const body = options.body ? JSON.parse(options.body) : {};
            const orders = JSON.parse(localStorage.getItem('pos_dinein_orders') || '[]');
            const orderIdx = orders.findIndex(o => o.id === id || o._id === id);
            if (orderIdx !== -1) {
                const order = orders[orderIdx];
                
                orders.splice(orderIdx, 1);
                localStorage.setItem('pos_dinein_orders', JSON.stringify(orders));

                const saleId = 'REC-OFFLINE-' + Date.now();
                const receiptNo = String(Date.now()).slice(-4);
                const subtotal = order.items.reduce((sum, i) => sum + (i.price * i.qty), 0);
                const discount = parseFloat(body.discount || 0);
                const total = subtotal - discount + parseFloat(body.tax || 0);

                const sale = {
                    id: saleId,
                    receiptNo,
                    date: new Date().toISOString(),
                    method: body.method || 'cash',
                    splitCash: parseFloat(body.splitCash || 0),
                    splitCard: parseFloat(body.splitCard || 0),
                    total,
                    subtotal,
                    discount,
                    tax: parseFloat(body.tax || 0),
                    cashier: order.items[0]?.addedBy || 'waiter',
                    orderType: 'dine_in',
                    tableName: order.tableName,
                    tableId: order.tableId,
                    items: order.items
                };

                const sales = JSON.parse(localStorage.getItem('pos_sales') || '[]');
                sales.unshift(sale);
                localStorage.setItem('pos_sales', JSON.stringify(sales));

                const currentShift = JSON.parse(localStorage.getItem('pos_current_shift') || 'null');
                if (currentShift) {
                    if (sale.method === 'cash') {
                        currentShift.expectedCash += parseFloat(sale.total || 0);
                    } else if (sale.method === 'split') {
                        currentShift.expectedCash += parseFloat(sale.splitCash || 0);
                    }
                    localStorage.setItem('pos_current_shift', JSON.stringify(currentShift));
                    const history = JSON.parse(localStorage.getItem('pos_shift_history') || '[]');
                    const idx = history.findIndex(s => s.id === currentShift.id);
                    if (idx !== -1) {
                        history[idx] = currentShift;
                        localStorage.setItem('pos_shift_history', JSON.stringify(history));
                    }
                }

                enqueueOfflineRequest(path, options, saleId);
                return { success: true, saleId, receiptNo };
            }
            throw new Error('Order not found');
        }

        // GET /parties/vendors
        if (method === 'GET' && cleanPath.startsWith('/parties/vendors')) {
            return window.EnhancedSecurity?.getSecureData('vendors') || [];
        }

        // GET /parties/customers
        if (method === 'GET' && cleanPath.startsWith('/parties/customers')) {
            return window.EnhancedSecurity?.getSecureData('customers') || [];
        }

        // GET /reports/history
        if (method === 'GET' && cleanPath.startsWith('/reports/history')) {
            return JSON.parse(localStorage.getItem('pos_sales') || '[]');
        }

        // GET /reports/live
        if (method === 'GET' && cleanPath.startsWith('/reports/live')) {
            const sales = JSON.parse(localStorage.getItem('pos_sales') || '[]');
            const total = sales.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
            return { success: true, sales, totalSales: total, transactionCount: sales.length };
        }

        // Fallback: return null for unhandled GET requests (non-critical)
        if (method === 'GET') {
            console.warn(`[OFFLINE_SIMULATOR] Unhandled GET ${cleanPath} — returning null`);
            return null;
        }

        throw new Error('You are currently offline. This action is not supported offline.');
    }

    let isSyncing = false;

    async function syncOfflineQueue() {
        if (isSyncing) return;
        const queue = JSON.parse(localStorage.getItem('pos_offline_queue') || '[]');
        if (queue.length === 0) {
            if (localStorage.getItem('pos_is_offline') === 'true') {
                const online = await pingServer();
                if (online) {
                    localStorage.setItem('pos_is_offline', 'false');
                    updateOfflineUI();
                }
            }
            return;
        }

        const online = await pingServer();
        if (!online) {
            localStorage.setItem('pos_is_offline', 'true');
            updateOfflineUI();
            return;
        }

        localStorage.setItem('pos_is_offline', 'false');
        isSyncing = true;
        updateOfflineUI();

        console.log(`[OFFLINE_SYNC] Found ${queue.length} queued requests. Commencing background synchronization.`);
        const idMappings = JSON.parse(localStorage.getItem('pos_offline_id_mappings') || '{}');

        while (queue.length > 0) {
            const req = queue[0];
            let url = req.path;
            let bodyStr = req.body;

            url = replaceOfflineIds(url, idMappings);
            if (bodyStr) {
                bodyStr = replaceOfflineIds(bodyStr, idMappings);
            }

            try {
                const branchId = localStorage.getItem("activeBranchId");
                const fetchOptions = {
                    method: req.method,
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    }
                };
                if (bodyStr) fetchOptions.body = bodyStr;
                if (branchId && branchId !== "bypass") {
                    fetchOptions.headers["x-branch-id"] = branchId;
                }

                const response = await fetch(API_BASE + (url.startsWith('/') ? url : '/' + url), fetchOptions);
                if (response.ok) {
                    const text = await response.text();
                    const result = text ? JSON.parse(text) : {};

                    if (req.tempId && (result.id || (result.order && result.order.id) || result.saleId)) {
                        const realId = result.id || (result.order && result.order.id) || result.saleId;
                        idMappings[req.tempId] = realId;
                        localStorage.setItem('pos_offline_id_mappings', JSON.stringify(idMappings));
                    }

                    queue.shift();
                    localStorage.setItem('pos_offline_queue', JSON.stringify(queue));
                    updateOfflineUI();
                } else {
                    console.error("[OFFLINE_SYNC] Server rejected request:", response.status);
                    if (response.status >= 500) {
                        break;
                    } else {
                        queue.shift();
                        localStorage.setItem('pos_offline_queue', JSON.stringify(queue));
                        updateOfflineUI();
                    }
                }
            } catch (err) {
                console.error("[OFFLINE_SYNC] Network error during synchronization:", err);
                break;
            }
        }

        isSyncing = false;
        updateOfflineUI();
    }

    setInterval(syncOfflineQueue, 10000);
    setTimeout(syncOfflineQueue, 1000);
    window.addEventListener('load', updateOfflineUI);

    async function apiFetch(path, options = {}) {
        const branchId = localStorage.getItem("activeBranchId");
        const isOffline = localStorage.getItem('pos_is_offline') === 'true';

        if (isOffline) {
            try {
                return await handleOfflineRequest(path, options);
            } catch (mockErr) {
                console.error("Offline Simulator Error:", mockErr);
                throw mockErr;
            }
        }

        const fetchOptions = {
            method: options.method || "GET",
            credentials: "include",
            headers: {}
        };

        if (options.body) {
            fetchOptions.headers["Content-Type"] = "application/json";
            fetchOptions.body = options.body;
        }

        if (branchId && branchId !== "bypass") {
            fetchOptions.headers["x-branch-id"] = branchId;
        }

        try {
            const safePath = path.startsWith('/') ? path : '/' + path;
            const response = await fetch(API_BASE + safePath, fetchOptions);

            if (!response.ok) {
                if (response.status === 401 && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
                    console.log('🔄 401 Unauthorized detected. Attempting token refresh...');
                    try {
                        const refreshResponse = await fetch(API_BASE + '/auth/refresh', {
                            method: 'GET',
                            credentials: 'include'
                        });

                        if (refreshResponse.ok) {
                            console.log('✅ Token Refreshed Successfully. Retrying original request...');
                            const retryResponse = await fetch(API_BASE + safePath, fetchOptions);
                            if (retryResponse.ok) {
                                const text = await retryResponse.text();
                                if (!text) return null;
                                return JSON.parse(text);
                            }
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

            const text = await response.text();
            if (!text) return null;
            return JSON.parse(text);

        } catch (err) {
            console.error("❌ apiFetch Network Error:", err);
            
            // Connection failure: enter offline mode immediately
            if (err instanceof TypeError || err.message.includes('fetch') || err.message.includes('Network') || err.message.includes('Failed')) {
                console.log("⚠️ Server unreachable. Switching to Offline Mode.");
                localStorage.setItem('pos_is_offline', 'true');
                updateOfflineUI();
                
                try {
                    return await handleOfflineRequest(path, options);
                } catch (mockErr) {
                    throw mockErr;
                }
            }
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
