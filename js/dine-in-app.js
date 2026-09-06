/**
 * Dine-In App — Waiter Interface & Table Workstation
 * Manages table grid, order workstation modal, cart item operations,
 * Dine-In taxes calculation, send-to-kitchen, pre-bill preview, and payment close.
 */

(function () {
    'use strict';

    // ─── State ───
    let tables = [];           // All tables for this branch
    let products = [];         // Menu items (loaded once)
    let dineInTaxes = [];      // Taxes applicable to dine_in
    let activeOrderId = null;  // Currently open order in workstation modal
    let activeTableId = null;
    let activeOrder = null;
    let pollTimer = null;
    let selectedCategory = 'All'; // Current category filter
    let searchQuery = '';         // Current search query
    let kitchenEnabled = true;    // Controlled by admin shop_settings.enableKitchen
    let selectedPaymentMethod = 'cash'; // Default payment method for closing bill

    // ─── Status chip config ───
    const STATUS = {
        pending: { label: 'Pending', color: 'bg-slate-700 text-slate-200', icon: 'schedule' },
        sent: { label: 'Sent', color: 'bg-blue-600 text-white', icon: 'send' },
        preparing: { label: 'Preparing', color: 'bg-orange-500 text-white', icon: 'outdoor_grill' },
        ready: { label: 'Ready', color: 'bg-emerald-600 text-white', icon: 'check_circle' },
        cancelled: { label: 'Cancelled', color: 'bg-rose-500/20 text-rose-400 line-through', icon: 'cancel' }
    };

    // ─── Init ───
    async function init() {
        // Read kitchen feature flag from shop settings
        try {
            const s = window.EnhancedSecurity?.getSecureData('shop_settings');
            if (s && s.enableKitchen === false) kitchenEnabled = false;
        } catch (e) { /* default true */ }

        await loadProducts();
        await loadDineInTaxes();
        await loadTables();
        // Auto-refresh table grid every 4s
        setInterval(loadTables, 4000);
    }

    // ═════════════════════════════════════════════
    // TAXES
    // ═════════════════════════════════════════════

    async function loadDineInTaxes() {
        try {
            const taxes = await apiFetch('/taxes?enabled=true');
            if (Array.isArray(taxes)) {
                dineInTaxes = taxes.filter(t => {
                    if (t.enabled === false) return false;
                    let types = [];
                    if (Array.isArray(t.orderTypes)) types = t.orderTypes;
                    else if (typeof t.orderTypes === 'string') {
                        try { types = JSON.parse(t.orderTypes); } catch (e) { types = []; }
                    }
                    return Array.isArray(types) && types.includes('dine_in');
                });
            }
        } catch (e) {
            console.warn('Failed to load dine-in taxes:', e);
        }
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
        if (!grid) return;

        if (!tables || tables.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center p-20 text-slate-600">
                    <span class="material-symbols-outlined text-5xl mb-3">table_restaurant</span>
                    <p class="text-lg">No tables yet.</p>
                    <p class="text-sm mt-1">Click "Tables Setup" to add your first table.</p>
                </div>`;
            return;
        }

        grid.innerHTML = tables.map(table => {
            const isOccupied = table.status === 'occupied';
            const isLocked = table.orderSummary?.isLocked;
            const hasBillRequest = table.orderSummary?.requestedBillAt;
            const allReady = table.orderSummary && table.orderSummary.sentCount === 0 && table.orderSummary.pendingCount === 0 && isOccupied;

            let borderColor = 'border-slate-700/80';
            let bgColor = 'bg-slate-800/90 hover:bg-slate-750 hover:border-slate-600';
            let statusDot = '<span class="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/50"></span>';
            let statusText = 'Available';
            let extraClass = '';

            if (isOccupied) {
                if (isLocked) {
                    borderColor = 'border-amber-500/80';
                    bgColor = 'bg-amber-950/20 hover:bg-amber-950/30';
                    statusDot = '<span class="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse"></span>';
                    statusText = 'Billing Requested';
                } else {
                    borderColor = 'border-rose-500/70';
                    bgColor = 'bg-rose-950/20 hover:bg-rose-950/30';
                    statusDot = '<span class="w-2.5 h-2.5 bg-rose-500 rounded-full"></span>';
                    statusText = 'Occupied';
                    if (allReady) extraClass = 'all-ready-pulse border-emerald-500/80';
                }
            }

            const badge = table.orderSummary
                ? `<div class="mt-2 flex flex-wrap justify-center gap-1">
                    ${table.orderSummary.pendingCount > 0 ? `<span class="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-200 rounded-full font-medium">${table.orderSummary.pendingCount} pending</span>` : ''}
                    ${table.orderSummary.sentCount > 0 ? `<span class="text-[10px] px-2 py-0.5 bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-full font-medium">${table.orderSummary.sentCount} sent</span>` : ''}
                    ${hasBillRequest ? `<span class="text-[10px] px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-full font-bold animate-pulse">🔔 Bill</span>` : ''}
                   </div>`
                : '';

            const orderDetails = isOccupied && table.orderSummary ? `
                <div class="mt-2.5 w-full pt-2 border-t border-slate-700/60 flex flex-col items-center">
                    <div class="flex items-center justify-between w-full text-xs font-bold mb-1.5 px-1">
                        <span class="text-slate-400 font-normal text-[11px]">${table.orderSummary.itemCount || 0} items</span>
                        <span class="text-amber-400 font-black">${formatCurrency(table.orderSummary.total)} EGP</span>
                    </div>
                    ${table.orderSummary.itemsPreview && table.orderSummary.itemsPreview.length > 0 ? `
                        <div class="w-full bg-slate-900/80 rounded-lg p-2 text-left border border-slate-700/50 space-y-1">
                            ${table.orderSummary.itemsPreview.map(p => `
                                <div class="text-slate-300 text-[11px] truncate flex items-center gap-1.5">
                                    <span class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                                    <span class="truncate font-medium">${p}</span>
                                </div>
                            `).join('')}
                            ${table.orderSummary.moreCount > 0 ? `
                                <div class="text-[10px] text-amber-400/90 font-semibold pl-3">+${table.orderSummary.moreCount} more</div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            ` : `
                <div class="mt-3 text-[11px] text-slate-500 group-hover:text-slate-400 flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">touch_app</span>
                    <span>Tap to start order</span>
                </div>
            `;

            return `
                <button onclick="DineIn.openTable('${table.id || table._id}', '${table.name}')"
                    class="group relative flex flex-col items-center justify-start p-4 rounded-2xl border-2 ${borderColor} ${bgColor} ${extraClass} transition-all duration-200 cursor-pointer text-center min-h-[160px] shadow-lg hover:shadow-xl hover:scale-[1.01]">
                    <span class="absolute top-2.5 right-2.5 text-[10px] font-semibold text-slate-400 bg-slate-800/80 border border-slate-700 px-1.5 py-0.5 rounded-md">${table.capacity || 4}p</span>
                    <span class="material-symbols-outlined text-3xl mb-1 ${isOccupied ? 'text-rose-400' : 'text-emerald-400'}">${isOccupied ? 'chair' : 'table_restaurant'}</span>
                    <p class="font-bold text-base text-white tracking-wide">${table.name}</p>
                    <div class="flex items-center gap-1.5 mt-0.5">
                        ${statusDot}
                        <span class="text-xs font-semibold ${isOccupied ? 'text-rose-300' : 'text-emerald-300'}">${statusText}</span>
                    </div>
                    ${badge}
                    ${orderDetails}
                </button>`;
        }).join('');
    }

    function updateStats(tables) {
        const occupied = tables.filter(t => t.status === 'occupied').length;
        const available = tables.filter(t => t.status === 'available').length;
        const statOcc = document.getElementById('stat-occupied');
        const statAvail = document.getElementById('stat-available');
        if (statOcc) statOcc.textContent = occupied;
        if (statAvail) statAvail.textContent = available;
    }

    // ═════════════════════════════════════════════
    // ORDER PANEL
    // ═════════════════════════════════════════════

    async function openTable(tableId, tableName) {
        activeTableId = tableId;
        document.getElementById('panel-title').textContent = tableName;
        document.getElementById('panel-subtitle').textContent = 'Loading...';

        showPanel();
        // Reset menu browser state
        selectedCategory = 'All';
        searchQuery = '';
        const searchInput = document.getElementById('item-search');
        if (searchInput) searchInput.value = '';
        renderMenuBrowser();

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
            activeOrderId = order?.id || order?._id;
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
        const validItems = (order.items || []).filter(i => i.kitchenStatus !== 'cancelled');
        const totalItemQty = validItems.reduce((sum, i) => sum + (i.qty || 1), 0);

        document.getElementById('panel-subtitle').textContent =
            isLocked ? '🔒 Bill requested — order locked' : `Order open · ${totalItemQty} items`;

        const pendingCount = validItems.filter(i => i.kitchenStatus === 'pending').length;
        const btnSend = document.getElementById('btn-send-kitchen');
        const btnBill = document.getElementById('btn-request-bill');
        const btnPay = document.getElementById('btn-pay-close');

        if (btnSend) {
            if (!kitchenEnabled) {
                btnSend.style.display = 'none';
            } else {
                btnSend.style.display = '';
                btnSend.disabled = pendingCount === 0 || isLocked;
            }
        }
        if (btnBill) btnBill.disabled = isLocked;
        if (btnPay) btnPay.disabled = validItems.length === 0;

        // Render Cart Items
        const container = document.getElementById('order-items');
        if (container) {
            if (validItems.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-16 text-slate-500">
                        <span class="material-symbols-outlined text-4xl mb-2 text-slate-600">restaurant</span>
                        <p class="text-sm font-medium">No items yet in this order.</p>
                        <p class="text-xs text-slate-600 mt-1">Select products from the right menu to add.</p>
                    </div>`;
            } else {
                // Group by batch
                const batches = {};
                validItems.forEach(item => {
                    const bn = item.batchNo || 0;
                    if (!batches[bn]) batches[bn] = [];
                    batches[bn].push(item);
                });

                container.innerHTML = Object.entries(batches).map(([batchNo, batchItems]) => {
                    const label = parseInt(batchNo) === 0 ? '📝 Current Draft (Not Sent)' : `Batch ${batchNo}`;
                    return `
                        <div class="mb-3">
                            <p class="text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider px-1">${label}</p>
                            <div class="space-y-2">
                                ${batchItems.map(item => renderItemRow(item, isLocked)).join('')}
                            </div>
                        </div>`;
                }).join('');
            }
        }

        // Subtotal & Taxes Calculation
        const subtotal = validItems.reduce((sum, i) => sum + (parseFloat(i.price || 0) * (i.qty || 1)), 0);
        let taxTotal = 0;
        let taxNames = [];
        dineInTaxes.forEach(t => {
            const amt = subtotal * (parseFloat(t.percentage || 0) / 100);
            taxTotal += amt;
            taxNames.push(`${t.name} (${t.percentage}%)`);
        });
        const grandTotal = subtotal + taxTotal;

        // Update DOM Cart Summary
        const cartItemCount = document.getElementById('cart-item-count');
        if (cartItemCount) {
            cartItemCount.textContent = `${totalItemQty} item${totalItemQty === 1 ? '' : 's'}`;
        }

        const subtotalEl = document.getElementById('cart-subtotal');
        if (subtotalEl) subtotalEl.textContent = `${formatCurrency(subtotal)} EGP`;

        const taxRowEl = document.getElementById('cart-taxes-row');
        const taxLabelEl = document.getElementById('cart-taxes-label');
        const taxAmtEl = document.getElementById('cart-taxes-amount');
        if (taxRowEl) {
            if (taxTotal > 0) {
                taxRowEl.classList.remove('hidden');
                if (taxLabelEl) taxLabelEl.textContent = `Taxes (${taxNames.join(', ')})`;
                if (taxAmtEl) taxAmtEl.textContent = `${formatCurrency(taxTotal)} EGP`;
            } else {
                taxRowEl.classList.add('hidden');
            }
        }

        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.textContent = `${formatCurrency(grandTotal)} EGP`;
    }

    function renderItemRow(item, isLocked) {
        const s = STATUS[item.kitchenStatus] || STATUS.pending;
        const canEdit = !isLocked && (item.kitchenStatus === 'pending' || !kitchenEnabled);
        const canCancel = !isLocked && (item.kitchenStatus === 'pending' || item.kitchenStatus === 'sent' || !kitchenEnabled);
        const itemLineTotal = (item.qty || 1) * parseFloat(item.price || 0);

        return `
            <div class="item-row flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 hover:border-slate-600 transition-colors">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <p class="text-sm font-bold text-white truncate">${item.name}</p>
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${s.color} shrink-0">
                            <span class="material-symbols-outlined text-[11px]">${s.icon}</span>${s.label}
                        </span>
                    </div>
                    ${item.note ? `<p class="text-xs text-amber-400/80 truncate mt-0.5">📝 ${item.note}</p>` : ''}
                    <p class="text-xs text-slate-400 mt-1">
                        ${item.qty} × ${formatCurrency(item.price)} = <span class="font-bold text-amber-400 font-mono">${formatCurrency(itemLineTotal)} EGP</span>
                    </p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    ${canEdit ? `
                    <div class="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
                        <button onclick="DineIn.changeQty('${item.lineId}', -1)"
                            class="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-sm transition-colors">−</button>
                        <span class="text-sm font-bold text-white w-6 text-center">${item.qty}</span>
                        <button onclick="DineIn.changeQty('${item.lineId}', 1)"
                            class="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-sm transition-colors">+</button>
                    </div>` : `
                    <span class="text-sm font-bold text-slate-300 px-2 py-1 bg-slate-900 rounded-lg">x${item.qty}</span>
                    `}
                    ${canCancel ? `
                    <button onclick="DineIn.cancelItem('${item.lineId}')" title="Remove item"
                        class="w-8 h-8 flex items-center justify-center text-rose-400 hover:text-white hover:bg-rose-500/20 rounded-lg transition-colors">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>` : ''}
                </div>
            </div>`;
    }

    // ═════════════════════════════════════════════
    // ITEM OPERATIONS
    // ═════════════════════════════════════════════

    async function loadProducts() {
        try {
            products = window.DB.getParts() || [];
            console.log(`[DineIn] Loaded ${products.length} products from local DB sync`);
        } catch (e) {
            console.error('[DineIn] Failed to load products from DB:', e.message);
            products = [];
        }
    }

    // ─── Category Browse Menu ───

    function renderMenuBrowser() {
        renderCategoryChips();
        renderItemGrid();
    }

    function renderCategoryChips() {
        const container = document.getElementById('category-chips');
        if (!container) return;
        const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))].sort((a, b) => {
            if (a === 'All') return -1;
            if (b === 'All') return 1;
            return a.localeCompare(b);
        });
        container.innerHTML = categories.map(cat => `
            <button class="cat-chip ${selectedCategory === cat ? 'active' : ''}"
                onclick="DineIn.selectCategory('${cat.replace(/'/g, "\\'")}')">
                ${cat}
            </button>`).join('');
    }

    function renderItemGrid() {
        const grid = document.getElementById('menu-item-grid');
        if (!grid) return;

        let filtered = products.filter(p => {
            const matchesCat = selectedCategory === 'All' || (p.category || 'Uncategorized') === selectedCategory;
            const matchesSearch = !searchQuery || (p.name || '').toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `<div class="col-span-2 text-center py-8 text-slate-600">
                <span class="material-symbols-outlined text-3xl mb-1">search_off</span>
                <p class="text-sm">No items found</p>
            </div>`;
            return;
        }

        grid.innerHTML = filtered.map(p => `
            <button class="menu-item-card" onclick="DineIn.addItem('${p.id}')">
                <span class="text-sm font-semibold text-white leading-tight line-clamp-2">${p.name}</span>
                ${p.category ? `<span class="text-[10px] text-slate-500">${p.category}</span>` : ''}
                <span class="text-sm font-bold text-amber-400 mt-auto">${formatCurrency(p.price || 0)}</span>
            </button>`).join('');
    }

    function selectCategory(cat) {
        selectedCategory = cat;
        renderCategoryChips();
        renderItemGrid();
    }

    function filterItems(query) {
        searchQuery = query;
        renderItemGrid();
    }

    // Legacy alias kept for safety
    function searchProducts(query) { filterItems(query); }

    async function addItem(productId) {
        if (!activeOrderId) return;
        const p = products.find(prod => String(prod.id) === String(productId));
        if (!p) return;

        // Check if already in pending items — increase qty instead (match by productId)
        const existing = activeOrder?.items?.find(i =>
            (i.productId === String(p.id) || i.id === String(p.id)) && i.kitchenStatus === 'pending'
        );

        let updatedItems;
        if (existing) {
            // Send only the fields the server needs to update existing item
            updatedItems = [{ lineId: existing.lineId, qty: existing.qty + 1, price: existing.price, note: existing.note }];
        } else {
            updatedItems = [{
                lineId: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
                id: String(p.id),         // Client uses 'id' for new items
                productId: String(p.id),  // Also include productId for normalization
                code: p.code || '',
                name: p.name,
                qty: 1,
                price: p.price || 0,
                cost: p.cost || 0,
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

        const currentQty = item.qty || 1;
        if (currentQty === 1 && delta === -1) {
            return cancelItem(lineId);
        }

        const newQty = Math.max(1, currentQty + delta);
        if (newQty === currentQty) return;

        try {
            const res = await apiFetch(`/orders/${activeOrderId}/items`, {
                method: 'PATCH',
                body: JSON.stringify({ version: activeOrder.version, items: [{ lineId: item.lineId, qty: newQty, price: item.price, note: item.note }] })
            });
            if (res?.order) { activeOrder = res.order; renderOrderPanel(activeOrder); }
            await loadTables();
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    async function cancelItem(lineId) {
        if (!activeOrderId) return;
        const confirmed = await (window.showConfirm ? window.showConfirm('Remove this item from the order?') : Promise.resolve(confirm('Remove this item from the order?')));
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
        const confirmed = await (window.showConfirm ? window.showConfirm('Request the bill for this table? This will lock the order.') : Promise.resolve(confirm('Request the bill for this table? This will lock the order.')));
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

    // ─── Pre-Bill Thermal Print Preview ───
    async function printReceiptPreview() {
        if (!activeOrderId || !activeOrder) return;
        try {
            await apiFetch(`/orders/${activeOrderId}/lock`, { method: 'POST' });
        } catch (e) { /* ignore if already locked */ }

        const validItems = (activeOrder.items || []).filter(i => i.kitchenStatus !== 'cancelled');
        const subtotal = validItems.reduce((sum, i) => sum + (parseFloat(i.price || 0) * (i.qty || 1)), 0);
        let taxTotal = 0;
        dineInTaxes.forEach(t => {
            taxTotal += subtotal * (parseFloat(t.percentage || 0) / 100);
        });
        const grandTotal = subtotal + taxTotal;

        const printWin = window.open('', '_blank', 'width=360,height=600');
        if (printWin) {
            printWin.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Pre-Bill - ${activeOrder.tableName || 'Table'}</title>
                    <style>
                        body { font-family: monospace, sans-serif; padding: 18px; font-size: 13px; color: #000; }
                        .center { text-align: center; }
                        .right { text-align: right; }
                        .divider { border-top: 1px dashed #000; margin: 8px 0; }
                        .row { display: flex; justify-content: space-between; margin: 4px 0; }
                        .bold { font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="center bold" style="font-size: 16px;">TASHGHEEL F&B</div>
                    <div class="center">DINE-IN PRE-BILL</div>
                    <div class="divider"></div>
                    <div class="row"><span>Table:</span><span class="bold">${activeOrder.tableName || 'Table'}</span></div>
                    <div class="row"><span>Date:</span><span>${new Date().toLocaleString()}</span></div>
                    <div class="divider"></div>
                    ${validItems.map(i => `
                        <div class="row">
                            <span style="flex:1;">${i.qty}x ${i.name}</span>
                            <span class="right font-mono">${formatCurrency(i.price * i.qty)}</span>
                        </div>
                    `).join('')}
                    <div class="divider"></div>
                    <div class="row"><span>Subtotal:</span><span>${formatCurrency(subtotal)} EGP</span></div>
                    ${taxTotal > 0 ? `<div class="row"><span>Taxes:</span><span>${formatCurrency(taxTotal)} EGP</span></div>` : ''}
                    <div class="divider"></div>
                    <div class="row bold" style="font-size: 15px;"><span>TOTAL:</span><span>${formatCurrency(grandTotal)} EGP</span></div>
                    <div class="divider"></div>
                    <div class="center" style="margin-top: 15px; font-size: 11px;">*** Pre-Bill / Unpaid Draft ***<br>Please proceed to cashier to settle.</div>
                    <script>window.onload = function() { window.print(); };</script>
                </body>
                </html>
            `);
            printWin.document.close();
        }

        showToast('Pre-bill printed & table locked', 'info');
        const order = await apiFetch(`/orders/${activeOrderId}`);
        if (order) { activeOrder = order; renderOrderPanel(order); }
        await loadTables();
    }

    // ─── Payment & Close Modal ───
    function openPayModal() {
        if (!activeOrderId || !activeOrder) return;
        const modal = document.getElementById('dinein-pay-modal');
        if (!modal) return;

        const validItems = (activeOrder.items || []).filter(i => i.kitchenStatus !== 'cancelled');
        if (validItems.length === 0) {
            showToast('Cannot pay an empty order. Please add items first.', 'warning');
            return;
        }

        const subtotal = validItems.reduce((sum, i) => sum + (parseFloat(i.price || 0) * (i.qty || 1)), 0);
        let taxTotal = 0;
        dineInTaxes.forEach(t => {
            taxTotal += subtotal * (parseFloat(t.percentage || 0) / 100);
        });
        const grandTotal = subtotal + taxTotal;

        const payTotalEl = document.getElementById('pay-modal-total');
        if (payTotalEl) payTotalEl.textContent = `${formatCurrency(grandTotal)} EGP`;

        const paySubEl = document.getElementById('pay-modal-subtitle');
        if (paySubEl) paySubEl.textContent = `${activeOrder.tableName || 'Table'} · ${validItems.length} item line(s)`;

        setPaymentMethod('cash');
        modal.classList.remove('hidden');
    }

    function closePayModal() {
        const modal = document.getElementById('dinein-pay-modal');
        if (modal) modal.classList.add('hidden');
    }

    function setPaymentMethod(method) {
        selectedPaymentMethod = method;
        ['cash', 'card', 'mobile'].forEach(m => {
            const btn = document.getElementById(`pay-btn-${m}`);
            if (!btn) return;
            if (m === method) {
                btn.className = 'py-3 rounded-xl border-2 font-bold text-sm flex flex-col items-center gap-1 border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-sm';
            } else {
                btn.className = 'py-3 rounded-xl border-2 font-bold text-sm flex flex-col items-center gap-1 border-slate-700 bg-slate-800 text-slate-300';
            }
        });
    }

    async function confirmPayAndClose() {
        if (!activeOrderId || !activeOrder) return;

        const validItems = (activeOrder.items || []).filter(i => i.kitchenStatus !== 'cancelled');
        const subtotal = validItems.reduce((sum, i) => sum + (parseFloat(i.price || 0) * (i.qty || 1)), 0);
        let taxTotal = 0;
        dineInTaxes.forEach(t => {
            taxTotal += subtotal * (parseFloat(t.percentage || 0) / 100);
        });

        try {
            const res = await apiFetch(`/orders/${activeOrderId}/close`, {
                method: 'POST',
                body: JSON.stringify({
                    method: selectedPaymentMethod,
                    closeOverride: true,
                    tax: taxTotal
                })
            });

            if (res?.success) {
                showToast(`✅ Payment completed! Receipt #${res.receiptNo || ''} generated.`, 'success');
                closePayModal();
                closePanel();
                await loadTables();
            }
        } catch (e) {
            showToast('Payment failed: ' + e.message, 'error');
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
                    <button onclick="DineIn.deleteTable('${t.id || t._id}', '${t.name}')"
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
        loadTables, openTable, closePanel,
        searchProducts, filterItems, selectCategory, renderMenuBrowser,
        addItem, changeQty, cancelItem, sendToKitchen, requestBill,
        openPayModal, closePayModal, setPaymentMethod, confirmPayAndClose, printReceiptPreview,
        openTableManager, addTable, deleteTable
    };

    window.addEventListener('SystemDataReady', () => {
        try {
            const s = window.EnhancedSecurity?.getSecureData('shop_settings');
            if (s && s.enableKitchen === false) kitchenEnabled = false;
        } catch (e) { }
        loadProducts();
        loadDineInTaxes();
        loadTables();
    });

    // ─── Boot ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
