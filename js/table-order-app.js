/**
 * Table Order App — Customer QR Page
 *
 * Mobile-first ordering page for customers scanning a table QR code.
 * Auth: QR session JWT (fetched from /api/tables/by-code then stored in sessionStorage).
 * Polls the order every 5s while tab is visible.
 */

(function () {
    'use strict';

    // ─── Config ───
    const BASE = '';      // Set to your server URL if needed e.g. 'https://yourapp.com'
    const POLL_INTERVAL = 5000;

    // ─── State ───
    let qrToken = null;
    let tableId = null;
    let orderId = null;
    let order = null;
    let products = [];
    let categories = [];
    let pendingNoteItem = null;   // Product pending a note
    let pollTimer = null;
    let isTabVisible = true;

    // ─── Status display ───
    const STATUS_LABEL = {
        pending: { label: 'Pending', icon: '⏳' },
        sent: { label: 'Sent', icon: '📤' },
        preparing: { label: 'Preparing', icon: '🍳' },
        ready: { label: 'Ready!', icon: '✅' },
        cancelled: { label: 'Cancelled', icon: '❌' }
    };

    // ─── Boot ───
    async function init() {
        // Handle tab visibility for smarter polling
        document.addEventListener('visibilitychange', () => {
            isTabVisible = !document.hidden;
        });

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const branch = params.get('branch');

        if (!code || !branch) {
            showError('Invalid QR code. Please scan the QR code at your table.');
            return;
        }

        try {
            setLoadingMessage('Connecting to your table...');

            // Fetch QR session token from server (public endpoint)
            const tokenRes = await fetchPublic(`/api/tables/by-code?code=${encodeURIComponent(code)}&branch=${encodeURIComponent(branch)}`);
            if (!tokenRes || !tokenRes.token) {
                showError('Table not found. Please scan the QR code again.');
                return;
            }

            qrToken = tokenRes.token;
            tableId = tokenRes.tableId;

            // Store token (clears on tab close)
            sessionStorage.setItem('qr_token', qrToken);
            sessionStorage.setItem('qr_table_id', tableId);

            // Set header
            document.getElementById('header-table-name').textContent = tokenRes.tableName || 'Your Table';

            // Load products
            setLoadingMessage('Loading menu...');
            await loadProducts(tokenRes.branchId, tokenRes.tableName);

            // Load or create order
            setLoadingMessage('Setting up your order...');
            await loadOrCreateOrder(tokenRes.activeOrderId);

            // Show the app
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('app').classList.remove('hidden');

            // Start polling
            startPolling();

        } catch (e) {
            console.error('Init error:', e);
            showError(e.message || 'Could not connect. Please try again.');
        }
    }

    // ─── Products ───
    async function loadProducts(branchId, tableName) {
        try {
            // Load from public menu endpoint
            const res = await fetchPublic(`/api/public/products?branch=${branchId}`);
            if (res && Array.isArray(res.products)) {
                products = res.products.filter(p => p.isActive !== false);
            } else if (res && Array.isArray(res)) {
                products = res.filter(p => p.isActive !== false);
            } else {
                products = [];
            }

            // Extract unique categories
            const catSet = new Set();
            products.forEach(p => { if (p.category) catSet.add(p.category); });
            categories = [...catSet];

            renderCategoryPills();
            renderProductGrid('all');
        } catch (e) {
            console.warn('Could not load products:', e.message);
            products = [];
            renderProductGrid('all');
        }
    }

    function renderCategoryPills() {
        const container = document.getElementById('category-pills');
        // Keep the "All" pill, add the rest
        const existing = container.querySelector('[data-cat="all"]');
        container.innerHTML = '';
        if (existing) container.appendChild(existing);

        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat-pill px-4 py-1.5 rounded-full bg-slate-700 text-slate-300 text-sm font-semibold whitespace-nowrap shrink-0';
            btn.setAttribute('data-cat', cat);
            btn.textContent = cat;
            btn.onclick = () => filterCategory(cat);
            container.appendChild(btn);
        });
    }

    function filterCategory(cat) {
        // Toggle active pill
        document.querySelectorAll('.cat-pill').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-cat') === cat);
            b.classList.toggle('bg-slate-700', b.getAttribute('data-cat') !== cat);
        });
        renderProductGrid(cat);
    }

    function renderProductGrid(cat) {
        const grid = document.getElementById('product-grid');
        const filtered = cat === 'all' ? products : products.filter(p => p.category === cat);

        if (filtered.length === 0) {
            grid.innerHTML = `<div class="col-span-2 text-center py-12 text-slate-600">
                <span class="material-symbols-outlined text-4xl mb-2 block">restaurant_menu</span>
                <p>No items in this category</p></div>`;
            return;
        }

        grid.innerHTML = filtered.map(p => {
            const inOrder = getOrderedQty(p.id);
            return `
                <button onclick="TableOrder.tapProduct(${JSON.stringify(JSON.stringify(p))})"
                    class="product-card bg-slate-800 rounded-2xl p-3 text-left border border-slate-700/50 active:border-amber-500/50 relative">
                    ${inOrder > 0 ? `<span class="absolute top-2 right-2 w-5 h-5 bg-amber-500 text-[10px] text-white font-bold rounded-full flex items-center justify-center">${inOrder}</span>` : ''}
                    <div class="w-full aspect-square bg-slate-700 rounded-xl mb-2 flex items-center justify-center">
                        <span class="material-symbols-outlined text-3xl text-slate-500">restaurant</span>
                    </div>
                    <p class="text-xs font-bold text-white leading-tight truncate">${p.name}</p>
                    <p class="text-xs text-amber-400 font-semibold mt-0.5">${formatCurrency(p.price)}</p>
                </button>`;
        }).join('');
    }

    function getOrderedQty(productId) {
        if (!order) return 0;
        return order.items
            .filter(i => i.id === String(productId) && i.kitchenStatus === 'pending')
            .reduce((s, i) => s + i.qty, 0);
    }

    // ─── Order ───
    async function loadOrCreateOrder(activeOrderId) {
        if (activeOrderId) {
            const res = await fetchAuth(`/api/orders/${activeOrderId}`);
            if (res) { order = res; orderId = res._id; }
        }

        if (!order) {
            const res = await fetchAuth('/api/orders', {
                method: 'POST',
                body: JSON.stringify({ tableId })
            });
            if (res?.order) { order = res.order; orderId = res.order._id; }
        }

        if (order) renderOrderState();
    }

    function renderOrderState() {
        if (!order) return;

        // Check lock
        if (order.isLocked) {
            document.getElementById('locked-screen').classList.remove('hidden');
            return;
        }
        document.getElementById('locked-screen').classList.add('hidden');

        const pendingItems = order.items.filter(i => i.kitchenStatus === 'pending');
        const totalItems = order.items.filter(i => i.kitchenStatus !== 'cancelled');

        // Update FAB
        const fab = document.getElementById('send-fab');
        const fabText = document.getElementById('fab-text');
        if (pendingItems.length > 0) {
            fab.classList.remove('hidden');
            fabText.textContent = `View Order · ${pendingItems.length} new item${pendingItems.length > 1 ? 's' : ''}`;
        } else {
            fab.classList.add('hidden');
        }

        // Update cart badge
        const badge = document.getElementById('cart-badge');
        if (totalItems.length > 0) {
            badge.textContent = totalItems.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        // Update header subtitle
        const sentItems = order.items.filter(i => ['sent', 'preparing', 'ready'].includes(i.kitchenStatus));
        let subtitle = 'Scan & Order';
        if (sentItems.length > 0) {
            const readyCount = order.items.filter(i => i.kitchenStatus === 'ready').length;
            subtitle = readyCount > 0 ? `✅ ${readyCount} item(s) ready!` : `🍳 ${sentItems.length} item(s) in kitchen`;
        }
        document.getElementById('header-subtitle').textContent = subtitle;

        // Update order summary
        const total = order.items
            .filter(i => i.kitchenStatus !== 'cancelled')
            .reduce((s, i) => s + i.price * i.qty, 0);
        const itemCount = order.items.filter(i => i.kitchenStatus !== 'cancelled').length;
        document.getElementById('order-summary-text').textContent = `${itemCount} item(s)`;
        document.getElementById('order-total').textContent = formatCurrency(total);

        // Re-render items in drawer
        renderOrderDrawer();

        // Re-render product grid to update qty badges
        const activePill = document.querySelector('.cat-pill.active');
        renderProductGrid(activePill ? activePill.getAttribute('data-cat') : 'all');
    }

    function renderOrderDrawer() {
        const list = document.getElementById('order-items-list');
        const items = (order?.items || []).filter(i => i.kitchenStatus !== 'cancelled');

        if (items.length === 0) {
            list.innerHTML = `<div class="text-center py-8 text-slate-600">
                <span class="material-symbols-outlined text-4xl mb-2 block">restaurant_menu</span>
                <p class="text-sm">No items yet. Browse the menu to add.</p></div>`;
            document.getElementById('btn-send-order').disabled = true;
            return;
        }

        // Group by batch
        const pending = items.filter(i => i.kitchenStatus === 'pending');
        const sent = items.filter(i => i.kitchenStatus !== 'pending');

        let html = '';

        if (pending.length > 0) {
            html += `<p class="text-xs text-slate-500 font-semibold uppercase mb-2">📝 Not sent yet</p>`;
            html += pending.map(item => renderOrderItem(item)).join('');
        }

        if (sent.length > 0) {
            html += `<p class="text-xs text-slate-500 font-semibold uppercase mt-4 mb-2">🍳 In kitchen</p>`;
            html += sent.map(item => renderOrderItem(item, true)).join('');
        }

        list.innerHTML = html;

        const hasPending = pending.length > 0;
        document.getElementById('btn-send-order').disabled = !hasPending;
    }

    function renderOrderItem(item, readonly = false) {
        const s = STATUS_LABEL[item.kitchenStatus] || STATUS_LABEL.pending;
        const canDelete = !readonly && !order.isLocked;

        return `
            <div class="flex items-center gap-3 py-2 border-b border-slate-800/50 fade-up">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-white truncate">${item.name}</p>
                    ${item.note ? `<p class="text-xs text-slate-500">📝 ${item.note}</p>` : ''}
                    <p class="text-xs text-slate-400">${item.qty} × ${formatCurrency(item.price)}</p>
                </div>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full status-${item.kitchenStatus}">
                    ${s.icon} ${s.label}
                </span>
                ${canDelete ? `
                <button onclick="TableOrder.removeItem('${item.lineId}')"
                    class="w-7 h-7 flex items-center justify-center text-red-400 hover:bg-red-500/20 rounded-lg">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>` : ''}
            </div>`;
    }

    // ─── Tap product → add with optional note ───
    function tapProduct(productJson) {
        const p = JSON.parse(productJson);
        // Bounce the card effect handled by :active CSS
        pendingNoteItem = p;

        // Show note modal
        document.getElementById('note-modal-title').textContent = `Add "${p.name}"`;
        document.getElementById('note-input').value = '';
        document.getElementById('note-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('note-input').focus(), 100);
    }

    async function confirmAddWithNote() {
        if (!pendingNoteItem) return;
        const note = document.getElementById('note-input').value.trim();
        document.getElementById('note-modal').classList.add('hidden');

        await addToOrder(pendingNoteItem, note);
        pendingNoteItem = null;
    }

    async function addToOrder(product, note = '') {
        if (!orderId) return;

        // Check if we already have a pending entry for this product
        const existing = order?.items?.find(i => i.id === String(product.id) && i.kitchenStatus === 'pending' && i.note === note);

        const newItem = existing
            ? { ...existing, qty: existing.qty + 1 }
            : {
                lineId: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
                id: String(product.id),
                code: product.code || '',
                name: product.name,
                qty: 1,
                price: product.price || 0,
                note,
                addedBy: 'customer'
            };

        try {
            const res = await fetchAuth(`/api/orders/${orderId}/items`, {
                method: 'PATCH',
                body: JSON.stringify({ version: order?.version, items: [newItem] })
            });
            if (res?.order) {
                order = res.order;
                renderOrderState();
                showToast(`Added ${product.name}`, 'success');
            }
        } catch (e) {
            if (e.message && e.message.includes('409')) {
                // Version conflict — refresh
                showToast('Refreshing your order...', 'info');
                const fresh = await fetchAuth(`/api/orders/${orderId}`);
                if (fresh) { order = fresh; renderOrderState(); }
            } else {
                showToast(e.message || 'Could not add item', 'error');
            }
        }
    }

    async function removeItem(lineId) {
        if (!orderId) return;
        try {
            await fetchAuth(`/api/orders/${orderId}/items/${lineId}`, { method: 'DELETE' });
            const fresh = await fetchAuth(`/api/orders/${orderId}`);
            if (fresh) { order = fresh; renderOrderState(); }
        } catch (e) {
            showToast(e.message || 'Could not remove item', 'error');
        }
    }

    async function sendToKitchen() {
        if (!orderId) return;
        try {
            const res = await fetchAuth(`/api/orders/${orderId}/send`, { method: 'POST' });
            if (res?.success) {
                showToast(`✅ ${res.sentCount} item(s) sent to kitchen!`, 'success');
                const fresh = await fetchAuth(`/api/orders/${orderId}`);
                if (fresh) { order = fresh; renderOrderState(); }
                hideMyOrder();
            }
        } catch (e) {
            showToast(e.message || 'Could not send order', 'error');
        }
    }

    // ─── Drawer open/close ───
    function showMyOrder() {
        document.getElementById('order-drawer').classList.remove('translate-y-full');
        document.getElementById('order-backdrop').classList.remove('hidden');
    }

    function hideMyOrder() {
        document.getElementById('order-drawer').classList.add('translate-y-full');
        document.getElementById('order-backdrop').classList.add('hidden');
    }

    // ─── Polling ───
    function startPolling() {
        pollTimer = setInterval(async () => {
            if (!orderId || !isTabVisible) return;
            try {
                const fresh = await fetchAuth(`/api/orders/${orderId}`);
                if (fresh) {
                    order = fresh;
                    renderOrderState();
                }
            } catch (e) { /* silent */ }
        }, POLL_INTERVAL);
    }

    // ─── HTTP helpers ───
    async function fetchPublic(url, options = {}) {
        const res = await fetch(BASE + url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    // ─── State for auto-refresh ───
    let isRefreshingToken = false;

    async function fetchAuth(url, options = {}, isRetry = false) {
        const token = qrToken || sessionStorage.getItem('qr_token');
        const res = await fetch(BASE + url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...(options.headers || {})
            }
        });

        // ─── Auto-refresh on 401 ───────────────────────────────────────────────
        // When the 4h QR session expires, silently re-call /by-code and retry.
        // Prevents the customer from ever seeing an "expired" error mid-meal.
        if (res.status === 401 && !isRetry && !isRefreshingToken) {
            isRefreshingToken = true;
            try {
                const params = new URLSearchParams(window.location.search);
                const code = params.get('code');
                const branch = params.get('branch');

                if (code && branch) {
                    const tokenRes = await fetchPublic(
                        `/api/tables/by-code?code=${encodeURIComponent(code)}&branch=${encodeURIComponent(branch)}`
                    );
                    if (tokenRes?.token) {
                        qrToken = tokenRes.token;
                        sessionStorage.setItem('qr_token', qrToken);
                        isRefreshingToken = false;
                        // Retry the original request exactly once with the new token
                        return fetchAuth(url, options, true);
                    }
                }
            } catch (e) {
                console.warn('[QR] Token refresh failed:', e.message);
            }
            isRefreshingToken = false;
            showError('Session expired. Please scan the QR code again.');
            throw new Error('Unauthorized');
        }
        // ─────────────────────────────────────────────────────────────────────────

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }


    // ─── UI helpers ───
    function setLoadingMessage(msg) {
        document.getElementById('loading-message').textContent = msg;
    }

    function showError(msg) {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('error-screen').classList.remove('hidden');
        document.getElementById('error-message').textContent = msg;
    }

    function formatCurrency(val) {
        return parseFloat(val || 0).toFixed(2);
    }

    let toastTimer;
    function showToast(msg, type = 'info') {
        const toast = document.getElementById('toast');
        const inner = document.getElementById('toast-inner');
        const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-slate-700' };
        inner.className = `px-4 py-3 rounded-xl text-white text-sm font-semibold shadow-2xl ${colors[type] || 'bg-slate-700'}`;
        inner.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // ─── Public API ───
    window.TableOrder = {
        filterCategory, tapProduct, confirmAddWithNote,
        removeItem, sendToKitchen, showMyOrder, hideMyOrder
    };

    // ─── Boot on DOM ready ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
