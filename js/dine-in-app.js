/**
 * Dine-In App — Waiter Interface
 * Manages table grid, order panel, item CRUD, send-to-kitchen, and bill request.
 * Polls server every 4 seconds when a panel is open.
 */

(function () {
    'use strict';

    // ─── State ───
    let tables = [];           // All tables for this branch
    let products = [];         // Menu items (loaded once)
    let activeOrderId = null;  // Currently open order in panel
    let activeTableId = null;
    let activeOrder = null;
    let pollTimer = null;

    // ─── Status chip config ───
    const STATUS = {
        pending: { label: 'Pending', color: 'bg-slate-600 text-slate-200', icon: 'schedule' },
        sent: { label: 'Sent', color: 'bg-blue-600 text-white', icon: 'send' },
        preparing: { label: 'Preparing', color: 'bg-orange-500 text-white', icon: 'outdoor_grill' },
        ready: { label: 'Ready', color: 'bg-green-500 text-white', icon: 'check_circle' },
        cancelled: { label: 'Cancelled', color: 'bg-red-500/20 text-red-400 line-through', icon: 'cancel' }
    };

    // ─── Init ───
    async function init() {
        await loadProducts();
        await loadTables();
        // Auto-refresh table grid every 4s
        setInterval(loadTables, 4000);
    }

    // ═════════════════════════════════════════════
    // TABLE GRID
    // ═════════════════════════════════════════════

    async function loadTables() {
        try {
            const data = await apiFetch('/tables');
            if (!data) return;
            tables = data;
            renderTableGrid(tables);
            updateStats(tables);
        } catch (e) {
            console.error('loadTables error:', e);
        }
    }

    function renderTableGrid(tables) {
        const grid = document.getElementById('tables-grid');
        if (!tables || tables.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center p-20 text-slate-600">
                    <span class="material-symbols-outlined text-5xl mb-3">table_restaurant</span>
                    <p class="text-lg">No tables yet.</p>
                    <p class="text-sm mt-1">Click "Manage Tables" to add your first table.</p>
                </div>`;
            return;
        }

        grid.innerHTML = tables.map(table => {
            const isOccupied = table.status === 'occupied';
            const isLocked = table.orderSummary?.isLocked;
            const hasBillRequest = table.orderSummary?.requestedBillAt;
            const allReady = table.orderSummary && table.orderSummary.sentCount === 0 && table.orderSummary.pendingCount === 0 && isOccupied;

            let borderColor = 'border-slate-700';
            let bgColor = 'bg-slate-800 hover:bg-slate-700';
            let statusDot = '<span class="w-2.5 h-2.5 bg-green-500 rounded-full"></span>';
            let statusText = 'Available';
            let extraClass = '';

            if (isOccupied) {
                if (isLocked) {
                    borderColor = 'border-amber-500/60';
                    bgColor = 'bg-amber-900/20 hover:bg-amber-900/30';
                    statusDot = '<span class="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse"></span>';
                    statusText = 'Billing';
                } else {
                    borderColor = 'border-red-500/60';
                    bgColor = 'bg-red-900/10 hover:bg-red-900/20';
                    statusDot = '<span class="w-2.5 h-2.5 bg-red-500 rounded-full"></span>';
                    statusText = 'Occupied';
                    if (allReady) extraClass = 'all-ready-pulse border-green-500/80';
                }
            }

            const badge = table.orderSummary
                ? `<div class="mt-2 flex flex-wrap gap-1">
                    ${table.orderSummary.pendingCount > 0 ? `<span class="text-[10px] px-1.5 py-0.5 bg-slate-700 rounded-full">${table.orderSummary.pendingCount} pending</span>` : ''}
                    ${table.orderSummary.sentCount > 0 ? `<span class="text-[10px] px-1.5 py-0.5 bg-blue-700 rounded-full">${table.orderSummary.sentCount} sent</span>` : ''}
                    ${hasBillRequest ? `<span class="text-[10px] px-1.5 py-0.5 bg-amber-700 rounded-full">🔔 Bill</span>` : ''}
                   </div>`
                : '';

            return `
                <button onclick="DineIn.openTable('${table._id}', '${table.name}')"
                    class="relative flex flex-col items-center justify-center p-4 rounded-xl border-2 ${borderColor} ${bgColor} ${extraClass} transition-all cursor-pointer text-center min-h-[120px]">
                    <span class="material-symbols-outlined text-4xl mb-1 ${isOccupied ? 'text-red-400' : 'text-slate-400'}">${isOccupied ? 'chair' : 'table_restaurant'}</span>
                    <p class="font-bold text-sm text-white">${table.name}</p>
                    <div class="flex items-center gap-1 mt-1">
                        ${statusDot}
                        <span class="text-[11px] text-slate-400">${statusText}</span>
                    </div>
                    ${badge}
                    <span class="absolute top-2 right-2 text-[10px] text-slate-600">${table.capacity}p</span>
                </button>`;
        }).join('');
    }

    function updateStats(tables) {
        const occupied = tables.filter(t => t.status === 'occupied').length;
        const available = tables.filter(t => t.status === 'available').length;
        document.getElementById('stat-occupied').textContent = occupied;
        document.getElementById('stat-available').textContent = available;
    }

    // ═════════════════════════════════════════════
    // ORDER PANEL
    // ═════════════════════════════════════════════

    async function openTable(tableId, tableName) {
        activeTableId = tableId;
        document.getElementById('panel-title').textContent = tableName;
        document.getElementById('panel-subtitle').textContent = 'Loading...';

        showPanel();

        // Load or create order
        try {
            let order = await apiFetch(`/orders/table/${tableId}`);
            if (!order) {
                // Create a new open order for this table
                const result = await apiFetch('/orders', {
                    method: 'POST',
                    body: JSON.stringify({ tableId })
                });
                order = result?.order;
            }
            activeOrderId = order?._id;
            activeOrder = order;
            renderOrderPanel(order);
            startPolling();
        } catch (e) {
            showToast('Could not load order: ' + e.message, 'error');
        }
    }

    function showPanel() {
        const panel = document.getElementById('order-panel');
        const backdrop = document.getElementById('panel-backdrop');
        panel.classList.remove('hidden-panel', 'pointer-events-none');
        backdrop.classList.remove('opacity-0', 'pointer-events-none');
    }

    function closePanel() {
        const panel = document.getElementById('order-panel');
        const backdrop = document.getElementById('panel-backdrop');
        panel.classList.add('hidden-panel', 'pointer-events-none');
        backdrop.classList.add('opacity-0', 'pointer-events-none');
        stopPolling();
        activeOrderId = null;
        activeTableId = null;
        activeOrder = null;
        document.getElementById('product-results').classList.add('hidden');
        document.getElementById('item-search').value = '';
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(async () => {
            if (!activeOrderId) return;
            try {
                const order = await apiFetch(`/orders/${activeOrderId}`);
                if (order) {
                    activeOrder = order;
                    renderOrderPanel(order);
                }
            } catch (e) { /* silent poll failure */ }
        }, 4000);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function renderOrderPanel(order) {
        if (!order) return;

        const isLocked = order.isLocked;
        document.getElementById('panel-subtitle').textContent =
            isLocked ? '🔒 Bill requested — locked' : `Order open · ${order.items?.length || 0} items`;

        const pendingCount = (order.items || []).filter(i => i.kitchenStatus === 'pending').length;
        const btnSend = document.getElementById('btn-send-kitchen');
        const btnBill = document.getElementById('btn-request-bill');

        btnSend.disabled = pendingCount === 0 || isLocked;
        btnBill.disabled = isLocked;

        const container = document.getElementById('order-items');

        const items = (order.items || []).filter(i => i.kitchenStatus !== 'cancelled');
        if (items.length === 0) {
            container.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-slate-600">
                <span class="material-symbols-outlined text-4xl mb-2">restaurant</span>
                <p class="text-sm">No items yet. Search to add.</p>
            </div>`;
            return;
        }

        // Group by batch
        const batches = {};
        items.forEach(item => {
            const bn = item.batchNo || 0;
            if (!batches[bn]) batches[bn] = [];
            batches[bn].push(item);
        });

        container.innerHTML = Object.entries(batches).map(([batchNo, batchItems]) => {
            const label = parseInt(batchNo) === 0 ? '📝 Not sent yet' : `Batch ${batchNo}`;
            return `
                <div class="mb-4">
                    <p class="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">${label}</p>
                    ${batchItems.map(item => renderItemRow(item, isLocked)).join('')}
                </div>`;
        }).join('');
    }

    function renderItemRow(item, isLocked) {
        const s = STATUS[item.kitchenStatus] || STATUS.pending;
        const canEdit = item.kitchenStatus === 'pending' && !isLocked;
        const canCancel = (item.kitchenStatus === 'pending' || item.kitchenStatus === 'sent') && !isLocked;

        return `
            <div class="item-row flex items-center gap-3 p-2.5 rounded-lg bg-slate-800 border border-slate-700/50">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-white truncate">${item.name}</p>
                    ${item.note ? `<p class="text-xs text-slate-500 truncate">📝 ${item.note}</p>` : ''}
                    <p class="text-xs text-slate-400">${item.qty} × ${formatCurrency(item.price)}</p>
                </div>
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.color} shrink-0">
                    <span class="material-symbols-outlined text-xs">${s.icon}</span>${s.label}
                </span>
                ${canEdit ? `
                <div class="flex items-center gap-1 shrink-0">
                    <button onclick="DineIn.changeQty('${item.lineId}', -1)"
                        class="w-6 h-6 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-xs">−</button>
                    <span class="text-sm w-5 text-center">${item.qty}</span>
                    <button onclick="DineIn.changeQty('${item.lineId}', 1)"
                        class="w-6 h-6 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-xs">+</button>
                </div>` : ''}
                ${canCancel ? `
                <button onclick="DineIn.cancelItem('${item.lineId}')" title="Remove item"
                    class="w-7 h-7 flex items-center justify-center text-red-400 hover:bg-red-500/20 rounded-lg shrink-0 transition-colors">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>` : ''}
            </div>`;
    }

    // ═════════════════════════════════════════════
    // ITEM OPERATIONS
    // ═════════════════════════════════════════════

    async function loadProducts() {
        try {
            const data = await window.electronAPI.readData('spare_parts');
            products = Array.isArray(data) ? data : (typeof data === 'string' ? JSON.parse(data) : []);
        } catch (e) { products = []; }
    }

    function searchProducts(query) {
        const results = document.getElementById('product-results');
        if (!query || query.length < 1) { results.classList.add('hidden'); return; }

        const matches = products.filter(p =>
            p.name && p.name.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);

        if (matches.length === 0) { results.classList.add('hidden'); return; }

        results.classList.remove('hidden');
        results.innerHTML = matches.map(p => `
            <button onclick="DineIn.addItem(${JSON.stringify(JSON.stringify(p))})"
                class="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700 transition-colors text-left">
                <span class="text-sm text-white">${p.name}</span>
                <span class="text-sm text-amber-400">${formatCurrency(p.price || 0)}</span>
            </button>`).join('');
    }

    async function addItem(productJson) {
        if (!activeOrderId) return;
        const p = JSON.parse(productJson);

        document.getElementById('item-search').value = '';
        document.getElementById('product-results').classList.add('hidden');

        // Check if already in pending items — increase qty instead
        const existing = activeOrder?.items?.find(i => i.id === String(p.id) && i.kitchenStatus === 'pending');

        let updatedItems;
        if (existing) {
            updatedItems = [{ ...existing, qty: existing.qty + 1 }];
        } else {
            updatedItems = [{
                lineId: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
                id: String(p.id),
                code: p.code || '',
                name: p.name,
                qty: 1,
                price: p.price || 0,
                note: '',
                addedBy: 'waiter'
            }];
        }

        try {
            const res = await apiFetch(`/orders/${activeOrderId}/items`, {
                method: 'PATCH',
                body: JSON.stringify({ version: activeOrder?.version, items: updatedItems })
            });
            if (res?.order) { activeOrder = res.order; renderOrderPanel(activeOrder); }
            await loadTables();
        } catch (e) {
            if (e.message.includes('409') || e.message.includes('updated by someone')) {
                showToast('Order was updated by someone else — refreshing...', 'warning');
                const order = await apiFetch(`/orders/${activeOrderId}`);
                if (order) { activeOrder = order; renderOrderPanel(order); }
            } else {
                showToast('Could not add item: ' + e.message, 'error');
            }
        }
    }

    async function changeQty(lineId, delta) {
        if (!activeOrder) return;
        const item = activeOrder.items.find(i => i.lineId === lineId);
        if (!item) return;

        const newQty = Math.max(1, (item.qty || 1) + delta);
        if (newQty === item.qty) return;

        try {
            const res = await apiFetch(`/orders/${activeOrderId}/items`, {
                method: 'PATCH',
                body: JSON.stringify({ version: activeOrder.version, items: [{ ...item, qty: newQty }] })
            });
            if (res?.order) { activeOrder = res.order; renderOrderPanel(activeOrder); }
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    async function cancelItem(lineId) {
        if (!activeOrderId) return;
        const confirmed = await window.showConfirm('Remove this item from the order?');
        if (!confirmed) return;

        try {
            await apiFetch(`/orders/${activeOrderId}/items/${lineId}`, { method: 'DELETE' });
            const order = await apiFetch(`/orders/${activeOrderId}`);
            if (order) { activeOrder = order; renderOrderPanel(order); }
            await loadTables();
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    // ═════════════════════════════════════════════
    // KITCHEN / BILL ACTIONS
    // ═════════════════════════════════════════════

    async function sendToKitchen() {
        if (!activeOrderId) return;
        try {
            const res = await apiFetch(`/orders/${activeOrderId}/send`, { method: 'POST' });
            if (res?.success) {
                showToast(`✅ Batch ${res.batchNo} sent — ${res.sentCount} item(s) to kitchen`, 'success');
                const order = await apiFetch(`/orders/${activeOrderId}`);
                if (order) { activeOrder = order; renderOrderPanel(order); }
                await loadTables();
            }
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    async function requestBill() {
        if (!activeOrderId) return;
        const confirmed = await window.showConfirm('Request the bill for this table? This will lock the order.');
        if (!confirmed) return;

        try {
            await apiFetch(`/orders/${activeOrderId}/lock`, { method: 'POST' });
            showToast('🔔 Bill requested. Cashier will process the payment.', 'success');
            const order = await apiFetch(`/orders/${activeOrderId}`);
            if (order) { activeOrder = order; renderOrderPanel(order); }
            await loadTables();
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    // ═════════════════════════════════════════════
    // TABLE MANAGER
    // ═════════════════════════════════════════════

    async function openTableManager() {
        document.getElementById('table-manager-modal').classList.remove('hidden');
        renderTableManagerList();
    }

    function renderTableManagerList() {
        const list = document.getElementById('table-manager-list');
        if (!tables || tables.length === 0) {
            list.innerHTML = '<p class="text-slate-500 text-sm text-center py-4">No tables yet.</p>';
            return;
        }
        list.innerHTML = tables.map(t => `
            <div class="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                <div>
                    <p class="font-semibold text-white text-sm">${t.name}</p>
                    <p class="text-xs text-slate-500">Code: ${t.code} · ${t.capacity} seats</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs px-2 py-0.5 rounded-full ${t.status === 'occupied' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}">${t.status}</span>
                    <button onclick="DineIn.deleteTable('${t._id}', '${t.name}')"
                        class="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors ${t.status === 'occupied' ? 'opacity-40 cursor-not-allowed' : ''}"
                        ${t.status === 'occupied' ? 'disabled' : ''}>
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </div>
            </div>`).join('');
    }

    async function addTable() {
        const name = document.getElementById('new-table-name').value.trim();
        const code = document.getElementById('new-table-code').value.trim().toUpperCase();
        if (!name || !code) { showToast('Name and code are required', 'error'); return; }

        try {
            await apiFetch('/tables', { method: 'POST', body: JSON.stringify({ name, code, capacity: 4 }) });
            document.getElementById('new-table-name').value = '';
            document.getElementById('new-table-code').value = '';
            showToast(`✅ "${name}" added`, 'success');
            await loadTables();
            renderTableManagerList();
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    async function deleteTable(id, name) {
        const confirmed = await window.showConfirm(`Delete "${name}"? This cannot be undone.`);
        if (!confirmed) return;
        try {
            await apiFetch(`/tables/${id}`, { method: 'DELETE' });
            showToast(`Deleted "${name}"`, 'success');
            await loadTables();
            renderTableManagerList();
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    // ═════════════════════════════════════════════
    // UTILITIES
    // ═════════════════════════════════════════════

    function formatCurrency(val) {
        return parseFloat(val || 0).toFixed(2);
    }

    let toastTimer;
    function showToast(msg, type = 'info') {
        const toast = document.getElementById('toast');
        const inner = document.getElementById('toast-inner');
        const colors = { success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-amber-600', info: 'bg-slate-700' };
        inner.className = `px-5 py-3 rounded-xl text-white text-sm font-semibold shadow-2xl flex items-center gap-2 ${colors[type] || colors.info}`;
        inner.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
    }

    // ─── Public API ───
    window.DineIn = {
        loadTables, openTable, closePanel, searchProducts,
        addItem, changeQty, cancelItem, sendToKitchen, requestBill,
        openTableManager, addTable, deleteTable
    };

    // ─── Boot ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
