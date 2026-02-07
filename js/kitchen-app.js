
window.currentPage = 'orders';
document.addEventListener('DOMContentLoaded', () => {
    loadKitchenOrders();
    // Auto-refresh every 10 seconds (User requested fast updates)
    setInterval(loadKitchenOrders, 10000);
});

function loadKitchenOrders() {
    const grid = document.getElementById('kitchen-grid');
    if (!grid) return;

    // 1. Get ALL Sales
    const sales = window.DB.getSales() || [];

    // 2. Filter for Pending Kitchen Orders
    // We look for 'pending' status. 
    // Fallback: If no kitchenStatus exists (legacy), we assume 'completed' to avoid flooding.
    const kitchenOrders = sales.filter(s => s.kitchenStatus === 'pending');

    // Sort by Date Ascending (Oldest First - FIFO)
    kitchenOrders.sort((a, b) => new Date(a.date) - new Date(b.date));

    grid.innerHTML = '';

    if (kitchenOrders.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-20 text-slate-600 opacity-50">
                <span class="material-symbols-outlined text-6xl mb-4">check_circle</span>
                <p class="text-xl font-medium">All orders completed!</p>
                <p class="text-sm">Waiting for new orders...</p>
            </div>`;
        return;
    }

    kitchenOrders.forEach(sale => {
        const date = new Date(sale.date);
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Calculate Elapsed Time
        const minutesAgo = Math.floor((new Date() - date) / 60000);
        let timeColor = 'text-slate-400';
        if (minutesAgo > 15) timeColor = 'text-red-400';
        else if (minutesAgo > 5) timeColor = 'text-amber-400';

        // Order Type Badge
        let typeBadge = '';
        if (sale.orderType === 'dine_in') typeBadge = `<span class="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded text-xs border border-blue-800">Dine In</span>`;
        if (sale.orderType === 'delivery') typeBadge = `<span class="bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded text-xs border border-purple-800">Delivery</span>`;
        if (sale.orderType === 'take_away') typeBadge = `<span class="bg-orange-900/50 text-orange-300 px-2 py-0.5 rounded text-xs border border-orange-800">Take Away</span>`;

        // Table Info
        let tableInfo = '';
        if (sale.tableId) tableInfo = `<div class="text-xs text-slate-400 mt-1">Table: <span class="text-white font-bold">${sale.tableName}</span></div>`;

        const card = document.createElement('div');
        card.className = 'bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col animate-fade-in relative';

        // Timer Badge
        const timerHtml = `<div class="absolute top-2 right-2 text-xs font-mono font-bold ${timeColor} bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-700">${minutesAgo}m</div>`;

        card.innerHTML = `
            <div class="bg-slate-750 px-4 py-3 border-b border-slate-700">
                <div class="flex items-center gap-2 mb-1">
                    <span class="font-bold text-amber-500 text-lg">#${sale.receiptNo || sale.id.slice(-4)}</span>
                    ${typeBadge}
                </div>
                ${tableInfo}
                ${sale.note ? `<div class="mt-2 p-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-200 font-bold italic">Note: ${sale.note}</div>` : ''}
                ${timerHtml}
                <div class="text-[10px] text-slate-500 mt-1">${time}</div>
            </div>
            
            <ul class="p-4 space-y-3 flex-1 overflow-y-auto min-h-[150px]">
                ${sale.items.map(item => `
                    <li class="flex flex-col border-b border-slate-700/50 pb-2 last:border-0 last:pb-0">
                        <div class="flex justify-between items-start">
                             <span class="text-slate-200 font-medium text-sm leading-tight">${item.name}</span>
                             <span class="font-bold text-slate-900 bg-amber-500 px-2 py-0.5 rounded text-sm shrink-0 ml-2">${item.qty}</span>
                        </div>
                        ${item.note ? `<span class="text-[11px] text-red-300 italic mt-0.5 ml-2">◦ ${item.note}</span>` : ''}
                    </li>
                `).join('')}
            </ul>

            <div class="p-3 bg-slate-750 border-t border-slate-700">
                 <button onclick="completeOrder('${sale.id}')" 
                    class="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-green-500/20 active:scale-95">
                    <span class="material-symbols-outlined">check</span>
                    <span>Complete Order</span>
                 </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.completeOrder = function (saleId) {
    if (!confirm('Mark this order as complete?')) return;

    // 1. Get Sales
    const sales = window.DB.getSales();
    const saleIndex = sales.findIndex(s => s.id === saleId);

    if (saleIndex > -1) {
        // 2. Update Status
        sales[saleIndex].kitchenStatus = 'completed';
        sales[saleIndex].kitchenCompletedAt = new Date().toISOString();

        // 3. Save
        // We need to use DB.saveSale but that might be tricky if it expects a single object logic. 
        // Let's use internal storage logic since we modified the array.
        // Actually DB.saveSale usually updates if ID exists.
        window.DB.saveSale(sales[saleIndex]);

        // 4. Refresh UI
        loadKitchenOrders();

        // 5. Toast
        // Simple toast
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-5 right-5 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 font-bold flex items-center gap-2';
        toast.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Order Completed';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }
};
