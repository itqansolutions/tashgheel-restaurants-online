/**
 * Aggregator Hub — Frontend Module
 * 
 * Handles polling for delivery orders, rendering in kitchen display,
 * and accept/reject/ready/retry actions.
 * Uses the global apiFetch() from web-adapter.js.
 */

(function () {
    'use strict';

    const POLL_INTERVAL = 15000; // 15 seconds
    let pollTimer = null;
    let providerInfo = {};
    let lastOrderCount = 0;

    // ─── Notification Sound ───
    const notifSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdG+Jk5WHdGlzfIqTjYF3bXV8iZGOgnhud3mIjo2Cenl3eIaLiIJ+fnuFh4WDgIB/gYOCg4GAgIGBgoGBgYKBgYGBgoGBgYGCgYGBgYKBgYGBgoGBgYGCgQ==');
    notifSound.volume = 0.5;

    // ─── Provider Color Map (fallback) ───
    const PROVIDER_COLORS = {
        talabat: { bg: 'bg-orange-600/30', border: 'border-orange-500', text: 'text-orange-300', label: 'Talabat', icon: '🟠' },
        uber_eats: { bg: 'bg-green-600/30', border: 'border-green-500', text: 'text-green-300', label: 'Uber Eats', icon: '🟢' },
        careem_now: { bg: 'bg-emerald-600/30', border: 'border-emerald-500', text: 'text-emerald-300', label: 'Careem Now', icon: '🟩' },
        mrsool: { bg: 'bg-purple-600/30', border: 'border-purple-500', text: 'text-purple-300', label: 'Mrsool', icon: '🟣' }
    };

    // ─── Initialize ───
    async function init() {
        try {
            providerInfo = await apiFetch('/aggregator/providers') || {};
        } catch (e) {
            console.warn('⚠️ Could not load provider info:', e.message);
        }

        loadAggregatorOrders();
        pollTimer = setInterval(loadAggregatorOrders, POLL_INTERVAL);
    }

    // ─── Load & Render Orders ───
    async function loadAggregatorOrders() {
        const grid = document.getElementById('aggregator-grid');
        if (!grid) return;

        try {
            const orders = await apiFetch('/aggregator/orders?status=pending') || [];
            const acceptedOrders = await apiFetch('/aggregator/orders?status=accepted') || [];
            const allActive = [...orders, ...acceptedOrders];

            // Notification for new orders
            if (allActive.length > lastOrderCount && lastOrderCount > 0) {
                try { notifSound.play(); } catch (e) { /* ignore */ }
            }
            lastOrderCount = allActive.length;

            // Update badge count
            const badge = document.getElementById('aggregator-badge');
            if (badge) {
                badge.textContent = orders.length;
                badge.style.display = orders.length > 0 ? 'flex' : 'none';
            }

            renderOrders(grid, allActive);

        } catch (err) {
            console.error('❌ Failed to load aggregator orders:', err);
            grid.innerHTML = `
                <div class="col-span-full text-center text-red-400 p-10">
                    <span class="material-symbols-outlined text-4xl mb-2">error</span>
                    <p>Failed to load delivery orders</p>
                    <p class="text-xs text-slate-500 mt-1">${err.message}</p>
                </div>`;
        }
    }

    // ─── Render Order Cards ───
    function renderOrders(grid, orders) {
        if (orders.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center p-16 text-slate-600 opacity-50">
                    <span class="material-symbols-outlined text-5xl mb-3">delivery_dining</span>
                    <p class="text-lg font-medium">No delivery orders</p>
                    <p class="text-sm">Waiting for orders from delivery apps...</p>
                </div>`;
            return;
        }

        // Sort: pending first, then by oldest
        orders.sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        grid.innerHTML = orders.map(order => renderOrderCard(order)).join('');
    }

    // ─── Single Order Card ───
    function renderOrderCard(order) {
        const colors = PROVIDER_COLORS[order.provider] || PROVIDER_COLORS.talabat;
        const createdAt = new Date(order.createdAt);
        const minutesAgo = Math.floor((Date.now() - createdAt) / 60000);
        const timeStr = createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Timer color
        let timerColor = 'text-slate-400';
        if (minutesAgo > 15) timerColor = 'text-red-400 animate-pulse';
        else if (minutesAgo > 5) timerColor = 'text-amber-400';

        // Items HTML
        const itemsHtml = (order.items || []).map(item => `
            <li class="flex justify-between items-start border-b border-slate-700/50 pb-2 last:border-0 last:pb-0">
                <div class="flex flex-col">
                    <span class="text-slate-200 font-medium text-sm">${item.name}</span>
                    ${item.notes ? `<span class="text-[11px] text-amber-300 italic mt-0.5">◦ ${item.notes}</span>` : ''}
                </div>
                <span class="font-bold text-slate-900 bg-amber-500 px-2 py-0.5 rounded text-sm shrink-0 ml-2">${item.qty}</span>
            </li>
        `).join('');

        // Customer info
        const customerHtml = order.customer?.name ?
            `<div class="text-xs text-slate-400 mt-1">
                <span class="text-white font-semibold">${order.customer.name}</span>
                ${order.customer.phone ? ` • ${order.customer.phone}` : ''}
            </div>` : '';

        // Action buttons based on status
        let actionsHtml = '';
        if (order.status === 'pending') {
            actionsHtml = `
                <div class="flex gap-2">
                    <button onclick="window.AggregatorHub.rejectOrder('${order._id}')"
                        class="flex-1 py-2.5 bg-red-600/80 hover:bg-red-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 text-sm active:scale-95">
                        <span class="material-symbols-outlined text-sm">close</span> Reject
                    </button>
                    <button onclick="window.AggregatorHub.acceptOrder('${order._id}')"
                        class="flex-[2] py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-lg hover:shadow-green-500/20 active:scale-95">
                        <span class="material-symbols-outlined text-sm">check</span> Accept
                    </button>
                </div>`;
        } else if (order.status === 'accepted') {
            actionsHtml = `
                <button onclick="window.AggregatorHub.readyOrder('${order._id}')"
                    class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-lg active:scale-95">
                    <span class="material-symbols-outlined text-sm">local_shipping</span> Mark Ready for Pickup
                </button>`;
        } else if (order.status === 'mapping_failed') {
            actionsHtml = `
                <button onclick="window.AggregatorHub.retryOrder('${order._id}')"
                    class="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 active:scale-95">
                    <span class="material-symbols-outlined text-sm">refresh</span> Retry
                </button>
                <p class="text-xs text-red-400 mt-1 text-center">${order.lastError || 'Mapping failed'}</p>`;
        }

        // Total
        const total = order.financials?.total || 0;
        const currency = order.financials?.currency || 'EGP';

        return `
            <div class="bg-slate-800 border ${colors.border} rounded-xl overflow-hidden shadow-lg flex flex-col relative
                        ${order.status === 'pending' ? 'ring-2 ring-offset-2 ring-offset-slate-900 ' + colors.border.replace('border-', 'ring-') : ''}">
                
                <!-- Timer Badge -->
                <div class="absolute top-2 right-2 text-xs font-mono font-bold ${timerColor} bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-700 flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">timer</span> ${minutesAgo}m
                </div>

                <!-- Header -->
                <div class="px-4 py-3 border-b border-slate-700 ${colors.bg}">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="${colors.bg} ${colors.text} px-2 py-0.5 rounded text-xs font-bold border ${colors.border}">
                            ${colors.icon} ${colors.label}
                        </span>
                        <span class="font-bold text-white text-sm">#${order.providerOrderId?.slice(-6) || '—'}</span>
                        ${order.status !== 'pending' ? `<span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">${order.status}</span>` : ''}
                    </div>
                    ${customerHtml}
                    <div class="text-[10px] text-slate-500 mt-1">${timeStr} • ${order.paymentMethod?.toUpperCase() || 'ONLINE'}</div>
                </div>

                <!-- Items -->
                <ul class="p-4 space-y-3 flex-1 overflow-y-auto min-h-[100px] max-h-[250px]">
                    ${itemsHtml}
                </ul>

                <!-- Footer -->
                <div class="p-3 bg-slate-750 border-t border-slate-700 space-y-2">
                    <div class="flex justify-between text-sm font-bold px-1">
                        <span class="text-slate-400">Total</span>
                        <span class="text-white">${total.toFixed(2)} ${currency}</span>
                    </div>
                    ${actionsHtml}
                </div>
            </div>`;
    }

    // ─── Actions ───
    async function acceptOrder(orderId) {
        if (!confirm('Accept this delivery order?')) return;
        try {
            const result = await apiFetch(`/aggregator/orders/${orderId}/accept`, { method: 'POST', body: '{}' });
            if (result.success) {
                showToast('✅ Order accepted & added to POS', 'green');
                loadAggregatorOrders();
            }
        } catch (err) {
            showToast('❌ Failed to accept: ' + err.message, 'red');
        }
    }

    async function rejectOrder(orderId) {
        const reason = prompt('Rejection reason (optional):') || 'Rejected by staff';
        try {
            const result = await apiFetch(`/aggregator/orders/${orderId}/reject`, {
                method: 'POST', body: JSON.stringify({ reason })
            });
            if (result.success) {
                showToast('Order rejected', 'amber');
                loadAggregatorOrders();
            }
        } catch (err) {
            showToast('❌ Failed to reject: ' + err.message, 'red');
        }
    }

    async function readyOrder(orderId) {
        if (!confirm('Mark order as ready for pickup?')) return;
        try {
            const result = await apiFetch(`/aggregator/orders/${orderId}/ready`, { method: 'POST', body: '{}' });
            if (result.success) {
                showToast('🚗 Order marked ready for pickup', 'blue');
                loadAggregatorOrders();
            }
        } catch (err) {
            showToast('❌ Failed: ' + err.message, 'red');
        }
    }

    async function retryOrder(orderId) {
        try {
            const result = await apiFetch(`/aggregator/orders/${orderId}/retry`, { method: 'POST', body: '{}' });
            if (result.success) {
                showToast('🔄 Order queued for retry', 'amber');
                loadAggregatorOrders();
            }
        } catch (err) {
            showToast('❌ Retry failed: ' + err.message, 'red');
        }
    }

    // ─── Toast Helper ───
    function showToast(message, color = 'green') {
        const bgMap = { green: 'bg-green-600', red: 'bg-red-600', amber: 'bg-amber-600', blue: 'bg-blue-600' };
        const toast = document.createElement('div');
        toast.className = `fixed bottom-5 right-5 ${bgMap[color] || 'bg-slate-700'} text-white px-4 py-2.5 rounded-lg shadow-lg z-50 font-bold text-sm`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ─── Public API ───
    window.AggregatorHub = {
        init,
        loadAggregatorOrders,
        acceptOrder,
        rejectOrder,
        readyOrder,
        retryOrder
    };

    // Auto-init if on kitchen page
    if (document.getElementById('aggregator-grid')) {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
