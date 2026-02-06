// reports-app.js

document.addEventListener('DOMContentLoaded', () => {
  // Hybrid Translation Helper
  const t = (keyOrEn, ar) => {
    const lang = localStorage.getItem('pos_language') || 'en';
    if (ar) return lang === 'ar' ? ar : keyOrEn;
    if (window.translations && window.translations[keyOrEn]) {
      return window.translations[keyOrEn][lang];
    }
    return keyOrEn;
  };
  const safe = n => Math.max(0, n);

  const fromDateInput = document.getElementById('from-date');
  const toDateInput = document.getElementById('to-date');

  // UI State
  let historyPage = 1;

  // Initialization
  window.addEventListener('languageChanged', refreshReports);
  document.getElementById('from-date').addEventListener('change', refreshReports);
  document.getElementById('to-date').addEventListener('change', refreshReports);

  document.querySelectorAll('.report-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.report-tab').forEach(btn => btn.classList.remove('active'));
      tab.classList.add('active');
      const selected = tab.dataset.tab;
      document.querySelectorAll('.report-card').forEach(card => card.style.display = 'none');
      const card = document.getElementById('card-' + selected);
      if (card) card.style.display = 'block';
      runReport(selected);
    });
  });

  function refreshReports() {
    const activeTab = document.querySelector('.report-tab.active')?.dataset.tab || 'live';
    runReport(activeTab);
  }

  // === LIVE MONITOR LOGIC ===
  async function loadLiveStats() {
    if (!window.electronAPI.getLiveReport) return;

    const data = await window.electronAPI.getLiveReport();
    if (!data) return;

    const { stats, recentOrders, currentShift } = data;

    document.getElementById('live-revenue').textContent = `${(stats.totalRevenue || 0).toFixed(2)} ${t('EGP', 'ج.م')}`;
    document.getElementById('live-orders').textContent = stats.orderCount || 0;
    document.getElementById('live-avg').textContent = `${(stats.avgTicket || 0).toFixed(2)} ${t('EGP', 'ج.m')}`;

    // Update Shift Indicator in Live Monitor if it exists
    const shiftInfo = document.getElementById('live-shift-info');
    if (shiftInfo) {
      if (currentShift) {
        const cashSales = currentShift.totals?.cashTotal || 0;
        shiftInfo.innerHTML = `
          <div style="background:#fff3e0; padding:10px; border-radius:8px; border:1px solid #ffe0b2; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-weight:bold; color:#e65100;">Active Shift:</span> 
              ${new Date(currentShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div>
              <span style="font-weight:bold; color:#bf360c;">Drawer Expected:</span> 
              ${(currentShift.openingCash + cashSales).toFixed(2)} EGP
            </div>
          </div>
        `;
      } else {
        shiftInfo.innerHTML = '';
      }
    }

    const tbody = document.getElementById('live-recent-body');
    tbody.innerHTML = '';

    (recentOrders || []).forEach(order => {
      const tr = document.createElement('tr');
      const time = new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      tr.innerHTML = `
                <td>#${order.id}</td>
                <td>${order.total.toFixed(2)}</td>
                <td>${order.paymentMethod || 'cash'}</td>
                <td>${order.cashier || '-'}</td>
                <td>${time}</td>
            `;
      tbody.appendChild(tr);
    });
  }

  // === SALES HISTORY LOGIC ===
  async function loadSalesHistory(page = 1) {
    historyPage = page;
    const from = fromDateInput.value;
    const to = toDateInput.value;

    const result = await window.electronAPI.getSalesHistory({ page, from, to });
    if (!result) return;

    const { summary, sales, pages } = result;

    document.getElementById('total-sales-cash').textContent = `${(summary.totalCash || 0).toFixed(2)} ${t('EGP', 'ج.م')}`;
    document.getElementById('total-sales-card').textContent = `${(summary.totalCard || 0).toFixed(2)} ${t('EGP', 'ج.م')}`;
    document.getElementById('total-sales-mobile').textContent = `${(summary.totalMobile || 0).toFixed(2)} ${t('EGP', 'ج.م')}`;
    document.getElementById('total-discounts').textContent = `${(summary.totalDiscount || 0).toFixed(2)} ${t('EGP', 'ج.م')}`;

    const tbody = document.getElementById('sales-history-body');
    tbody.innerHTML = '';

    sales.forEach(sale => {
      const tr = document.createElement('tr');
      const dateStr = new Date(sale.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      tr.innerHTML = `
                <td>#${sale.id}</td>
                <td>${dateStr}</td>
                <td>${sale.paymentMethod || 'cash'}</td>
                <td>${sale.cashier || '-'}</td>
                <td><strong>${sale.total.toFixed(2)}</strong></td>
            `;
      tbody.appendChild(tr);
    });

    document.getElementById('page-info').textContent = `Page ${page} of ${pages || 1}`;
    document.getElementById('prev-page').disabled = (page <= 1);
    document.getElementById('next-page').disabled = (page >= (pages || 1));
  }

  // Pagination Listeners
  document.getElementById('prev-page').addEventListener('click', () => {
    if (historyPage > 1) loadSalesHistory(historyPage - 1);
  });
  document.getElementById('next-page').addEventListener('click', () => {
    loadSalesHistory(historyPage + 1);
  });

  // === MASTER REPORT RUNNER ===
  function runReport(type) {
    if (type === 'live') {
      loadLiveStats();
      return;
    }
    if (type === 'sales') {
      loadSalesHistory(1);
      return;
    }

    // Logic for other reports (Visits, Profits, etc.) using local/aggregated data
    const fromDate = fromDateInput.value ? new Date(fromDateInput.value) : null;
    const toDate = toDateInput.value ? new Date(toDateInput.value) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    // Fetch local receipts for offline-compatible / hybrid reports if needed
    const receipts = window.DB ? window.DB.getSales() : [];
    const filteredReceipts = receipts.filter(r => {
      const d = new Date(r.date);
      return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });

    const finished = filteredReceipts.filter(r => r.status === 'finished');
    const returns = filteredReceipts.filter(r => r.status === 'full_return' || r.status === 'partial_return');

    if (type === 'visits') {
      const visits = window.DB.getVisits();
      const relevantVisits = visits.filter(v => {
        const d = new Date(v.completedAt || v.createdAt);
        if (v.status !== 'Completed') return false;
        return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
      });
      renderTable('table-visits', relevantVisits.map(v => ({
        date: new Date(v.completedAt || v.createdAt).toLocaleDateString(),
        customer: v.customerName,
        technician: v.technician || '-',
        total: v.finalTotal || 0
      })), ['date', 'customer', 'technician', 'total'], [t("Date", "التاريخ"), t("Customer", "العميل"), t("Technician", "الفني"), t("Total", "الإجمالي")]);
    }

    if (type === 'cogs') {
      let totalCost = 0;
      finished.forEach(r => r.items.forEach(i => { if (!i.code?.startsWith('SVC-')) totalCost += i.qty * (i.cost || 0); }));
      document.getElementById('total-cogs').textContent = totalCost.toFixed(2) + ' ' + t('EGP', 'ج.م');
    }

    if (type === 'stock-value') generateStockValueReport();
    if (type === 'daily-summary') generateDailySummary(finished, filteredReceipts);
    if (type === 'shifts') generateShiftReport();
    if (type === 'inventory-report') generateInventoryReport();
  }

  // === DAILY SUMMARY REPORT ===
  function generateDailySummary(finished, allReceipts) {
    // Check if elements exist (tab may not be in HTML yet)
    const dsRevenue = document.getElementById('ds-revenue');
    if (!dsRevenue) {
      console.warn('Daily Summary tab not found in HTML');
      return;
    }

    // Calculate totals
    let totalRevenue = 0, totalCash = 0, totalCard = 0, totalMobile = 0, totalDiscounts = 0, totalDelivery = 0;

    finished.forEach(r => {
      totalRevenue += r.total || 0;
      totalDiscounts += r.discount || 0;
      totalDelivery += r.deliveryFee || 0;

      const method = (r.paymentMethod || r.method || 'cash').toLowerCase();
      if (method === 'cash') totalCash += r.total || 0;
      else if (method === 'card') totalCard += r.total || 0;
      else if (method === 'mobile') totalMobile += r.total || 0;
    });

    const orderCount = finished.length;
    const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;
    const netRevenue = totalRevenue - totalDiscounts;

    // Update summary boxes (with null checks)
    dsRevenue.textContent = `${totalRevenue.toFixed(2)} EGP`;
    const dsOrders = document.getElementById('ds-orders'); if (dsOrders) dsOrders.textContent = orderCount;
    const dsAvg = document.getElementById('ds-avg'); if (dsAvg) dsAvg.textContent = `${avgTicket.toFixed(2)} EGP`;
    const dsDiscounts = document.getElementById('ds-discounts'); if (dsDiscounts) dsDiscounts.textContent = `${totalDiscounts.toFixed(2)} EGP`;

    // Payment breakdown
    document.getElementById('ds-cash').textContent = `${totalCash.toFixed(2)} EGP`;
    document.getElementById('ds-card').textContent = `${totalCard.toFixed(2)} EGP`;
    document.getElementById('ds-mobile').textContent = `${totalMobile.toFixed(2)} EGP`;

    // Net revenue table
    const tbody = document.getElementById('daily-summary-body');
    tbody.innerHTML = `
      <tr><td>Gross Sales</td><td style="font-weight:bold; color:#047857;">+${totalRevenue.toFixed(2)}</td></tr>
      <tr><td>Discounts Applied</td><td style="color:#dc2626;">-${totalDiscounts.toFixed(2)}</td></tr>
      <tr><td>Delivery Fees Collected</td><td style="color:#0369a1;">+${totalDelivery.toFixed(2)}</td></tr>
      <tr style="background:#f0fdf4;"><td style="font-weight:bold;">Net Revenue</td><td style="font-weight:bold; font-size:1.2rem; color:#065f46;">${(netRevenue + totalDelivery).toFixed(2)}</td></tr>
      <tr><td>Cash Collected</td><td>${totalCash.toFixed(2)}</td></tr>
      <tr><td>Card Collected</td><td>${totalCard.toFixed(2)}</td></tr>
      <tr><td>Mobile Payments</td><td>${totalMobile.toFixed(2)}</td></tr>
    `;
  }

  // === SHIFT REPORT ===
  async function generateShiftReport() {
    const tbody = document.getElementById('shifts-body');
    if (!tbody) {
      console.warn('Shifts tab not found in HTML');
      return;
    }
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading shifts...</td></tr>';

    let shifts = [];

    // Try API first
    if (window.apiFetch) {
      try {
        const result = await window.apiFetch('/data/load?collection=shifts');
        shifts = result.data || [];
      } catch (e) {
        shifts = JSON.parse(localStorage.getItem('shifts') || '[]');
      }
    } else if (window.electronAPI?.getShifts) {
      shifts = await window.electronAPI.getShifts();
    } else {
      shifts = JSON.parse(localStorage.getItem('shifts') || '[]');
    }

    // Filter by date range
    const fromDate = document.getElementById('from-date').value ? new Date(document.getElementById('from-date').value) : null;
    const toDate = document.getElementById('to-date').value ? new Date(document.getElementById('to-date').value) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    shifts = shifts.filter(s => {
      const d = new Date(s.openedAt || s.createdAt);
      return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });

    tbody.innerHTML = '';

    if (shifts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#666;">No shifts found for this period.</td></tr>';
      return;
    }

    // Sort by date descending
    shifts.sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

    shifts.forEach(shift => {
      const tr = document.createElement('tr');
      const openedAt = shift.openedAt ? new Date(shift.openedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-';
      const closedAt = shift.closedAt ? new Date(shift.closedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Open';
      const openingCash = shift.openingCash || 0;
      const expectedCash = openingCash + (shift.totals?.cashTotal || 0);
      const closingCash = shift.closingCash || 0;
      const difference = shift.difference || (closingCash - expectedCash);
      const status = shift.status || 'unknown';

      const diffClass = difference >= 0 ? 'color:#047857;' : 'color:#dc2626;';
      const diffSign = difference >= 0 ? '+' : '';
      const statusBadge = status === 'open'
        ? '<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:10px; font-size:0.8rem;">Open</span>'
        : status === 'closed'
          ? '<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px; font-size:0.8rem;">Closed</span>'
          : '<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:10px; font-size:0.8rem;">' + status + '</span>';

      tr.innerHTML = `
        <td>${shift.cashierName || shift.cashierId || '-'}</td>
        <td>${openedAt}</td>
        <td>${closedAt}</td>
        <td>${openingCash.toFixed(2)}</td>
        <td>${expectedCash.toFixed(2)}</td>
        <td>${status === 'open' ? '-' : closingCash.toFixed(2)}</td>
        <td style="${diffClass}">${status === 'open' ? '-' : diffSign + difference.toFixed(2)}</td>
        <td>${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // === INVENTORY REPORT ===
  function generateInventoryReport() {
    const tbody = document.getElementById('inventory-report-body');
    if (!tbody) {
      console.warn('Inventory Report tab not found in HTML');
      return;
    }

    // Get products/inventory - use getParts for both since getInventory doesn't exist
    const products = window.DB ? window.DB.getParts() : JSON.parse(localStorage.getItem('products') || '[]');
    const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');

    // Combine products and inventory
    const allItems = [...products, ...inventory];

    let lowStockCount = 0;
    let totalValue = 0;
    const LOW_STOCK_THRESHOLD = 5;

    tbody.innerHTML = '';

    allItems.forEach(item => {
      const qty = item.stock || item.quantity || 0;
      const cost = item.cost || item.unitCost || 0;
      const value = qty * cost;
      const isLow = qty <= LOW_STOCK_THRESHOLD && qty > 0;
      const isOut = qty === 0;

      if (isLow || isOut) lowStockCount++;
      totalValue += value;

      const tr = document.createElement('tr');
      tr.style.background = isOut ? '#fef2f2' : isLow ? '#fffbeb' : '';

      let statusBadge = '<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px; font-size:0.75rem;">In Stock</span>';
      if (isOut) statusBadge = '<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:10px; font-size:0.75rem;">Out of Stock</span>';
      else if (isLow) statusBadge = '<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:10px; font-size:0.75rem;">Low Stock</span>';

      tr.innerHTML = `
        <td style="font-weight:500;">${item.name || 'Unnamed'}</td>
        <td>${item.category || '-'}</td>
        <td>${qty}</td>
        <td>${cost.toFixed(2)}</td>
        <td style="font-weight:bold;">${value.toFixed(2)}</td>
        <td>${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    });

    // Update summary
    document.getElementById('inv-low').textContent = lowStockCount;
    document.getElementById('inv-total').textContent = allItems.length;
    document.getElementById('inv-value').textContent = totalValue.toFixed(2) + ' EGP';
  }

  function generateStockValueReport() {
    const products = window.DB.getParts();
    const table = document.getElementById('table-stock-value');
    table.innerHTML = '';
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `<th>${t('Category', 'التصنيف')}</th><th>${t('Total Stock Cost', 'إجمالي تكلفة المخزون')} (${t('EGP', 'ج.م')})</th>`;
    table.appendChild(headerRow);

    const categoryMap = {};
    products.forEach(p => {
      const category = p.category || t('Uncategorized', 'غير مصنف');
      const total = parseFloat(p.cost || 0) * parseFloat(p.stock || 0);
      categoryMap[category] = (categoryMap[category] || 0) + total;
    });

    for (const cat in categoryMap) {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${cat}</td><td>${categoryMap[cat].toFixed(2)}</td>`;
      table.appendChild(row);
    }
  }

  function renderTable(tableId, data, fields, headers) {
    const table = document.getElementById(tableId);
    if (!table) return;
    table.innerHTML = '';
    const thead = table.insertRow();
    headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; thead.appendChild(th); });
    data.forEach(row => {
      const tr = table.insertRow();
      fields.forEach(f => { const td = tr.insertCell(); td.textContent = (row[f] || 0).toFixed ? row[f].toFixed(2) : row[f]; });
    });
  }

  // Auto-Refresh (Live Monitor only)
  setInterval(() => {
    if (document.querySelector('.report-tab.active')?.dataset.tab === 'live') loadLiveStats();
  }, 30000);

  // Bootstrap
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  if (currentUser.role === 'admin') document.querySelectorAll('.admin-only').forEach(e => e.style.display = 'block');

  runReport('live');
});
