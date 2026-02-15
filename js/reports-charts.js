/**
 * TASGHHEEL REPORTS CHARTS
 * Chart.js Wrapper Functions
 * Phase 7: Separation of Concerns
 */

window.ReportCharts = {
    // --- LIVE MONITOR / SALES ---
    renderSalesPerHour(receipts) {
        const ctx = document.getElementById('chart-sales-per-hour');
        if (!ctx) return;

        if (window.salesHourChart) window.salesHourChart.destroy();

        const hours = Array(24).fill(0);
        receipts.forEach(r => {
            const h = new Date(r.createdAt).getHours();
            hours[h] += (r.total || 0);
        });

        window.salesHourChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hours.map(h => `${h}:00`),
                datasets: [{
                    label: 'Sales (EGP)',
                    data: hours,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    },

    renderPaymentDistribution(receipts, canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const chartKey = 'chart_' + canvasId;
        if (window[chartKey]) window[chartKey].destroy();

        let cash = 0, card = 0, wallet = 0;
        receipts.forEach(r => {
            const m = (r.paymentMethod || 'cash').toLowerCase();
            if (m.includes('card') || m.includes('visa')) card += r.total;
            else if (m.includes('wallet') || m.includes('mobile')) wallet += r.total;
            else cash += r.total;
        });

        window[chartKey] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Cash', 'Card', 'Wallet'],
                datasets: [{
                    data: [cash, card, wallet],
                    backgroundColor: ['#10b981', '#3b82f6', '#8b5cf6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { position: 'bottom' } }
            }
        });
    },

    // --- SALES DEEP DIVE ---
    renderCategorySales(catMap) {
        const ctx = document.getElementById('chart-sales-category');
        if (!ctx) return;
        if (window.salesCatChart) window.salesCatChart.destroy();

        const sorted = Object.entries(catMap).sort((a, b) => b[1].net - a[1].net).slice(0, 8);

        window.salesCatChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [{
                    label: 'Net Sales',
                    data: sorted.map(s => s[1].net),
                    backgroundColor: '#f59e0b',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { grid: { display: false } } }
            }
        });
    },

    // --- COGS & PROFIT ---
    renderCOGSBreakdown(totals) {
        const ctx = document.getElementById('chart-cogs-breakdown');
        if (!ctx) return;
        if (window.cogsBreakdownChart) window.cogsBreakdownChart.destroy();

        window.cogsBreakdownChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Financial Overview'],
                datasets: [
                    { label: 'COGS', data: [totals.cogs], backgroundColor: '#f59e0b' },
                    { label: 'Net Sales', data: [totals.netSales], backgroundColor: '#3b82f6' },
                    { label: 'Gross Profit', data: [totals.profit], backgroundColor: '#10b981' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    },

    renderCOGSCategory(catMap) {
        const ctx = document.getElementById('chart-cogs-category');
        if (!ctx) return;
        if (window.cogsCategoryChart) window.cogsCategoryChart.destroy();

        const labels = Object.keys(catMap);
        const data = Object.values(catMap).map(c => c.cost);

        window.cogsCategoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#3b82f6'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false } } }
        });
    },

    // --- EXPENSES ---
    renderExpenseCategory(map) {
        const ctx = document.getElementById('chart-expenses-category');
        if (!ctx) return;
        if (window.expCatChart) window.expCatChart.destroy();

        window.expCatChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(map),
                datasets: [{
                    data: Object.values(map),
                    backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } }
            }
        });
    },

    renderExpenseTrend(map) {
        const ctx = document.getElementById('chart-expenses-trend');
        if (!ctx) return;
        if (window.expTrendChart) window.expTrendChart.destroy();

        const dates = Object.keys(map).sort((a, b) => new Date(a) - new Date(b));

        window.expTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Daily Expenses',
                    data: dates.map(d => map[d]),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } } } }
        });
    },

    // --- INVENTORY ---
    renderStockCategory(map) {
        const ctx = document.getElementById('chart-inv-category');
        if (!ctx) return;
        if (window.stockCatChart) window.stockCatChart.destroy();

        window.stockCatChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(map),
                datasets: [{
                    data: Object.values(map),
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }
        });
    },

    renderTopAssets(products) {
        const ctx = document.getElementById('chart-inv-top-assets');
        if (!ctx) return;
        if (window.stockTopChart) window.stockTopChart.destroy();

        const sorted = [...products].sort((a, b) => (b._computed.stockCost) - (a._computed.stockCost)).slice(0, 10);

        window.stockTopChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(p => p.name),
                datasets: [{ label: 'Stock Value', data: sorted.map(p => p._computed.stockCost), backgroundColor: '#3b82f6', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false } } }
        });
    },

    // --- DELIVERY ---
    renderDeliveryFeeTrend(dailyFeesMap) {
        const ctx = document.getElementById('chart-delivery-trend');
        if (!ctx) return;
        if (window.deliveryTrendChart) window.deliveryTrendChart.destroy();

        const dates = Object.keys(dailyFeesMap).sort((a, b) => new Date(a) - new Date(b));

        window.deliveryTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Delivery Fees',
                    data: dates.map(d => dailyFeesMap[d]),
                    borderColor: '#8b5cf6', // Violet
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } } } }
        });
    },

    renderDeliverySources(sourceMap) {
        const ctx = document.getElementById('chart-delivery-sources');
        if (!ctx) return;
        if (window.deliverySourceChart) window.deliverySourceChart.destroy();

        const sources = Object.keys(sourceMap);
        const data = Object.values(sourceMap).map(s => s.count); // Charting Count

        // Color Mapping
        const bgColors = sources.map(s => {
            const low = s.toLowerCase();
            if (low.includes('talabat')) return '#f97316'; // Orange
            if (low.includes('uber')) return '#10b981'; // Green
            if (low.includes('pos')) return '#3b82f6'; // Blue
            return '#64748b'; // Slate
        });

        window.deliverySourceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sources,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: { legend: { position: 'right' } }
            }
        });
    }
};
