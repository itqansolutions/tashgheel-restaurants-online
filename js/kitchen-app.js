
window.currentPage = 'orders';
document.addEventListener('DOMContentLoaded', () => {
    loadKitchenOrders();
    // Auto-refresh every 30 seconds
    setInterval(loadKitchenOrders, 30000);
});

function loadKitchenOrders() {
    const grid = document.getElementById('kitchen-grid');
    if (!grid) return;

    // Get recent sales from DB
    // Ideally we would have a "status" = "pending" or "kitchen".
    // For now, let's grab the last 10 "finished" sales as a demo, 
    // or filter by today's date.
    const sales = window.DB.getSales() || [];

    // Sort by Date Descending
    sales.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Taking last 12 orders for display
    const recentSales = sales.slice(0, 12);

    grid.innerHTML = '';

    if (recentSales.length === 0) {
        grid.innerHTML = '<div class="empty-state"><h3>No active orders</h3><p>Orders sent to kitchen will appear here.</p></div>';
        return;
    }

    recentSales.forEach(sale => {
        const date = new Date(sale.date);
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const card = document.createElement('div');
        card.className = 'bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col';

        card.innerHTML = `
            <div class="bg-slate-700 px-4 py-3 flex justify-between items-center border-b border-slate-600">
                <div class="font-bold text-amber-500 text-lg">#${sale.id.slice(-5)}</div>
                <div class="text-slate-400 text-sm font-mono bg-slate-800 px-2 py-1 rounded border border-slate-700">${time}</div>
            </div>
            
            <ul class="p-4 space-y-3 flex-1 overflow-y-auto">
                ${sale.items.map(item => `
                    <li class="flex justify-between items-start border-b border-slate-700/50 pb-2 last:border-0 last:pb-0">
                        <span class="text-slate-200 font-medium">${item.name}</span>
                        <span class="font-bold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded text-sm">${item.qty}x</span>
                    </li>
                `).join('')}
            </ul>

            <div class="px-4 py-3 bg-slate-700/50 border-t border-slate-700 flex justify-between items-center">
                 <span class="text-xs text-slate-500 uppercase font-bold tracking-wider">Status</span>
                 <span class="text-xs font-bold text-green-400 bg-green-900/20 px-2 py-1 rounded border border-green-900/50">PREPARING</span>
            </div>
        `;
        grid.appendChild(card);
    });
}
