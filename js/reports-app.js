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
          <div class="bg-amber-50 p-4 rounded-lg border border-amber-100 mb-4 flex justify-between items-center text-sm">
            <div>
              <span class="font-bold text-amber-700">Active Shift:</span> 
              <span class="text-amber-900">${new Date(currentShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div>
              <span class="font-bold text-amber-700">Drawer Expected:</span> 
              <span class="text-amber-900 font-mono font-bold">${(currentShift.openingCash + cashSales).toFixed(2)} EGP</span>
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
      tr.className = "border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors";
      const time = new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      tr.innerHTML = `
                <td class="px-6 py-3 font-mono text-slate-500">#${order.id.toString().slice(-6)}</td>
                <td class="px-6 py-3 font-bold text-slate-700">${order.total.toFixed(2)}</td>
                <td class="px-6 py-3 capitalize">${order.paymentMethod || 'cash'}</td>
                <td class="px-6 py-3">${order.cashier || '-'}</td>
                <td class="px-6 py-3 text-slate-400">${time}</td>
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
      tr.className = "border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors";
      const dateStr = new Date(sale.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      tr.innerHTML = `
                <td class="px-6 py-3 font-mono text-slate-500">#${sale.id.toString().slice(-6)}</td>
                <td class="px-6 py-3 text-slate-600">${dateStr}</td>
                <td class="px-6 py-3 capitalize badge-cell"><span class="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">${sale.paymentMethod || 'cash'}</span></td>
                <td class="px-6 py-3">${sale.cashier || '-'}</td>
                <td class="px-6 py-3 font-bold text-slate-800">${sale.total.toFixed(2)}</td>
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
    // Note: In the new HTML redesign (if implemented), we might need to target a specific container or create this table structure locally if it doesn't exist in the main markup yet as a dedicated card. 
    // Assuming we might add a Daily Summary card or this function is used elsewhere. 
    // For now, let's keep the logic but style the HTML output string.

    if (tbody) {
      tbody.innerHTML = `
        <tr class="border-b border-slate-50 hover:bg-slate-50">
            <td class="px-6 py-3">Gross Sales</td>
            <td class="px-6 py-3 font-bold text-green-700">+${totalRevenue.toFixed(2)}</td>
        </tr>
        <tr class="border-b border-slate-50 hover:bg-slate-50">
            <td class="px-6 py-3">Discounts Applied</td>
            <td class="px-6 py-3 font-bold text-red-600">-${totalDiscounts.toFixed(2)}</td>
        </tr>
        <tr class="border-b border-slate-50 hover:bg-slate-50">
            <td class="px-6 py-3">Delivery Fees Collected</td>
            <td class="px-6 py-3 font-bold text-blue-600">+${totalDelivery.toFixed(2)}</td>
        </tr>
        <tr class="bg-green-50/50 hover:bg-green-50">
            <td class="px-6 py-3 font-bold text-slate-800">Net Revenue</td>
            <td class="px-6 py-3 font-bold text-lg text-emerald-700">${(netRevenue + totalDelivery).toFixed(2)}</td>
        </tr>
        <tr class="border-b border-slate-50 hover:bg-slate-50">
            <td class="px-6 py-3 pl-8 text-slate-500">Cash Collected</td>
            <td class="px-6 py-3 text-slate-500">${totalCash.toFixed(2)}</td>
        </tr>
        <tr class="border-b border-slate-50 hover:bg-slate-50">
            <td class="px-6 py-3 pl-8 text-slate-500">Card Collected</td>
            <td class="px-6 py-3 text-slate-500">${totalCard.toFixed(2)}</td>
        </tr>
        <tr class="border-b border-slate-50 hover:bg-slate-50">
            <td class="px-6 py-3 pl-8 text-slate-500">Mobile Payments</td>
            <td class="px-6 py-3 text-slate-500">${totalMobile.toFixed(2)}</td>
        </tr>
        `;
    }
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
      tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400">No shifts found for this period.</td></tr>';
      return;
    }

    // Sort by date descending
    shifts.sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

    shifts.forEach(shift => {
      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-50 hover:bg-slate-50 transition-colors";

      const openedAt = shift.openedAt ? new Date(shift.openedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-';
      const closedAt = shift.closedAt ? new Date(shift.closedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Open';
      const openingCash = shift.openingCash || 0;
      const expectedCash = openingCash + (shift.totals?.cashTotal || 0);
      const closingCash = shift.closingCash || 0;
      const difference = shift.difference || (closingCash - expectedCash);
      const status = shift.status || 'unknown';

      const diffClass = difference >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold';
      const diffSign = difference >= 0 ? '+' : '';

      let statusBadge = '';
      if (status === 'open') statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">Open</span>';
      else if (status === 'closed') statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">Closed</span>';
      else statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">${status}</span>`;

      tr.innerHTML = `
        <td class="px-6 py-3 font-medium text-slate-700">${shift.cashierName || shift.cashierId || '-'}</td>
        <td class="px-6 py-3 text-slate-500 text-xs">${openedAt}</td>
        <td class="px-6 py-3 text-slate-500 text-xs">${closedAt}</td>
        <td class="px-6 py-3">${openingCash.toFixed(2)}</td>
        <td class="px-6 py-3">${expectedCash.toFixed(2)}</td>
        <td class="px-6 py-3">${status === 'open' ? '-' : closingCash.toFixed(2)}</td>
        <td class="px-6 py-3 ${diffClass}">${status === 'open' ? '-' : diffSign + difference.toFixed(2)}</td>
        <td class="px-6 py-3">${statusBadge}</td>
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
      tr.className = "border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors";
      if (isOut) tr.classList.add("bg-red-50/50", "hover:bg-red-50");
      else if (isLow) tr.classList.add("bg-amber-50/50", "hover:bg-amber-50");

      let statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">In Stock</span>';
      if (isOut) statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">Out of Stock</span>';
      else if (isLow) statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">Low Stock</span>';

      tr.innerHTML = `
        <td class="px-6 py-3 font-medium text-slate-800">${item.name || 'Unnamed'}</td>
        <td class="px-6 py-3 text-slate-500">${item.category || '-'}</td>
        <td class="px-6 py-3 font-bold">${qty}</td>
        <td class="px-6 py-3">${cost.toFixed(2)}</td>
        <td class="px-6 py-3 font-bold text-slate-700">${value.toFixed(2)}</td>
        <td class="px-6 py-3">${statusBadge}</td>
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

    // Header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headerRow.className = "bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200";

    const th1 = document.createElement('th'); th1.className = "px-6 py-3"; th1.textContent = t('Category', 'التصنيف');
    const th2 = document.createElement('th'); th2.className = "px-6 py-3"; th2.textContent = `${t('Total Stock Cost', 'إجمالي تكلفة المخزون')} (${t('EGP', 'ج.م')})`;
    headerRow.appendChild(th1);
    headerRow.appendChild(th2);

    const tbody = table.createTBody();
    tbody.className = "divide-y divide-slate-100 text-sm text-slate-600";

    const categoryMap = {};
    products.forEach(p => {
      const category = p.category || t('Uncategorized', 'غير مصنف');
      const total = parseFloat(p.cost || 0) * parseFloat(p.stock || 0);
      categoryMap[category] = (categoryMap[category] || 0) + total;
    });

    for (const cat in categoryMap) {
      const row = tbody.insertRow();
      row.className = "hover:bg-slate-50 transition-colors";
      row.innerHTML = `<td class="px-6 py-3 font-medium text-slate-800">${cat}</td><td class="px-6 py-3 font-bold text-slate-700">${categoryMap[cat].toFixed(2)}</td>`;
    }
  }

  function renderTable(tableId, data, fields, headers) {
    const table = document.getElementById(tableId);
    if (!table) return;
    table.innerHTML = '';

    // Create Header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headerRow.className = "bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200";
    headers.forEach(h => {
      const th = document.createElement('th');
      th.className = "px-6 py-3";
      th.textContent = h;
      headerRow.appendChild(th);
    });

    // Create Body
    const tbody = table.createTBody();
    tbody.className = "divide-y divide-slate-100 text-sm text-slate-600";

    data.forEach(row => {
      const tr = tbody.insertRow();
      tr.className = "hover:bg-slate-50 transition-colors";
      fields.forEach(f => {
        const td = tr.insertCell();
        td.className = "px-6 py-3";
        const val = row[f];
        // Simple formatting check
        td.textContent = (typeof val === 'number' && !Number.isInteger(val)) ? val.toFixed(2) : (val || '-');
      });
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
