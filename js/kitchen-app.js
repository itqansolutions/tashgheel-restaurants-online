
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

        // Filter items that are "Menu Items" (not direct products if needed, but usually everything goes to kitchen?)
        // Let's assume everything goes to kitchen for now.

        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `
            <div class="order-header">
                <strong>#${sale.id.slice(-5)}</strong>
                <span class="order-time">${time}</span>
            </div>
            <ul class="order-items">
                ${sale.items.map(item => `
                    <li class="order-item">
                        <span><span class="item-qty">${item.qty}x</span> ${item.name}</span>
                    </li>
                `).join('')}
            </ul>
        `;
        grid.appendChild(card);
    });
}
