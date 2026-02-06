// reports-app.js

document.addEventListener('DOMContentLoaded', async () => {
  // === 1. HYBRID TRANSLATION HELPER ===
  const t = (keyOrEn, ar) => {
    const lang = localStorage.getItem('pos_language') || 'en';
    if (ar) return lang === 'ar' ? ar : keyOrEn;
    if (window.translations && window.translations[keyOrEn]) {
      return window.translations[keyOrEn][lang];
    }
    return keyOrEn;
  };

  // === 2. INITIALIZATION & LISTENERS ===
  const branchFilter = document.getElementById('branchFilter');
  const fromDateInput = document.getElementById('from-date');
  const toDateInput = document.getElementById('to-date');

  // Default Date Range: Today
  setDateRange('today');

  // Load Branches
  await loadBranches();

  // Listeners
  window.addEventListener('languageChanged', () => refreshReports());
  if (branchFilter) branchFilter.addEventListener('change', () => refreshReports());

  // Global Access for HTML Buttons
  window.refreshReports = refreshReports;
  window.setDateRange = setDateRange;

  // Tab Switching Logic
  document.querySelectorAll('.report-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.report-tab').forEach(btn => btn.classList.remove('active'));
      tab.classList.add('active');

      const selected = tab.dataset.tab;
      document.querySelectorAll('.report-card').forEach(card => card.style.display = 'none');
      const card = document.getElementById('card-' + selected);
      if (card) card.style.display = 'block';

      refreshReports(); // Re-run report in context
    });
  });

  // === 3. CORE: BRANCH LOADING ===
  async function loadBranches() {
    if (!branchFilter) return;

    try {
      // Fetch branches from authenticated user session or API
      // Using API if available, else session
      let branches = [];
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}');

      if (window.apiFetch) {
        const res = await window.apiFetch('/auth/me');
        if (res && res.branches) branches = res.branches;
      } else if (user.branches) {
        branches = user.branches;
      }

      branchFilter.innerHTML = `<option value="all">${t('All Branches', 'كل الفروع')}</option>`;

      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        branchFilter.appendChild(opt);
      });

      // Restore previous selection
      const saved = localStorage.getItem('report_branch_filter');
      if (saved && branchFilter.querySelector(`option[value="${saved}"]`)) {
        branchFilter.value = saved;
      }

    } catch (e) {
      console.error("Failed to load branches for filter", e);
      branchFilter.innerHTML = `<option value="all">${t('All Branches', 'كل الفروع')}</option>`;
    }
  }

  // === 4. CORE: DATE PRESETS ===
  function setDateRange(preset) {
    const today = new Date();
    let from = new Date();
    let to = new Date();

    switch (preset) {
      case 'today':
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        break;
      case 'yesterday':
        from.setDate(today.getDate() - 1);
        from.setHours(0, 0, 0, 0);
        to.setDate(today.getDate() - 1);
        to.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        const day = today.getDay(); // 0 (Sun) to 6 (Sat)
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Start Monday/Sunday? Let's assume Sat/Sun start or standard localized
        // Simple version: last 7 days including today
        from.setDate(today.getDate() - 6);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        break;
      case 'thisMonth':
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        break;
      case 'lastMonth':
        from.setMonth(today.getMonth() - 1);
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        to.setDate(0); // Last day of prev month
        to.setHours(23, 59, 59, 999);
        break;
    }

    // Helper to format Input Date (YYYY-MM-DD)
    const fmt = d => d.toISOString().split('T')[0];
    fromDateInput.value = fmt(from);
    toDateInput.value = fmt(to);

    refreshReports();
  }

  // === 5. CORE: UNIFIED DATA CONTEXT LAYER ===
  async function buildReportContext() {
    const branchId = branchFilter ? branchFilter.value : 'all';
    localStorage.setItem('report_branch_filter', branchId);

    const fromDate = fromDateInput.value ? new Date(fromDateInput.value) : null;
    const toDate = toDateInput.value ? new Date(toDateInput.value) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    // --- DATA FETCHING ---
    let rawReceipts = [];
    let rawReturns = [];
    let rawProducts = [];
    let rawExpenses = [];
    let shifts = [];
    let users = []; // For cashier names if needed

    // LOAD DATA
    if (window.electronAPI) {
      try {
        if (window.DB) {
          rawReceipts = window.DB.getSales();
          rawProducts = window.DB.getParts();
        } else if (window.DataCache) {
          rawReceipts = window.DataCache.sales || [];
          rawProducts = window.DataCache.products || [];
          rawExpenses = window.DataCache.expenses || [];
        }
      } catch (e) { console.error("Data load error", e); }
    }

    // --- FILTERING ---
    // 1. Filter by Branch
    let receipts = rawReceipts;
    if (branchId !== 'all') {
      receipts = receipts.filter(r => r.branchId === branchId); // Strict branch check
    }

    // 2. Filter by Date
    if (fromDate && toDate) {
      receipts = receipts.filter(r => {
        const d = new Date(r.date);
        return d >= fromDate && d <= toDate;
      });
      // Also filter expenses to be added later
      rawExpenses = rawExpenses.filter(e => {
        const d = new Date(e.date);
        return d >= fromDate && d <= toDate;
      });
    }

    // --- SEGMENTATION ---
    const finishedSales = receipts.filter(r => r.status === 'finished');

    // Returns Logic:
    // Case A: Returns are negative receipts in same list
    // Case B: Returns are separate collection (DataCache.returns).
    // Let's assume standard POS: Returns obtained from separate list usually or status check
    let returns = receipts.filter(r => r.status === 'full_return' || r.status === 'partial_return'); // Simple status check first

    // --- GOLDEN FORMULAS ---
    let grossSales = 0;
    let totalDiscounts = 0;
    let totalReturns = 0;
    let cogs = 0;
    let totalTax = 0;

    // Aggregation Containers
    const catMap = {};
    const cashierMap = {};
    const prodMap = {};
    const payMap = {};

    finishedSales.forEach(r => {
      // Financials
      const subtotal = r.subtotal || r.total; // Prefer subtotal (pre-tax/disc)
      const discount = r.discount || 0;
      const tax = r.tax || 0; // Assuming receipt has tax field
      const total = r.total || (subtotal - discount + tax);

      grossSales += subtotal;
      totalDiscounts += discount;
      totalTax += tax;

      // Payment Map
      const method = (r.paymentMethod || 'cash').toLowerCase();
      let pKey = 'cash';
      if (method.includes('card') || method.includes('visa')) pKey = 'card';
      else if (method.includes('wallet') || method.includes('mobile')) pKey = 'wallet';
      else pKey = 'cash';

      payMap[pKey] = (payMap[pKey] || 0) + total;

      // Cashier Map
      const cashier = r.cashier || 'Unknown';
      if (!cashierMap[cashier]) cashierMap[cashier] = { count: 0, gross: 0, discount: 0, net: 0 };
      cashierMap[cashier].count++;
      cashierMap[cashier].gross += subtotal;
      cashierMap[cashier].discount += discount;
      cashierMap[cashier].net += (subtotal - discount); // Net for cashier usually excludes tax in some systems, but simple net = gross - disc

      // Items Loop (Category & Products)
      if (r.items) {
        r.items.forEach(item => {
          if (item.code && item.code.startsWith('SVC-')) return;
          const qty = item.qty || 1;
          const cost = item.cost || item.unitCost || 0;
          const price = item.price || 0;
          const lineTotal = price * qty;

          cogs += (qty * cost);

          // Product Key
          const pName = item.name || item.description || 'Unknown Item';
          if (!prodMap[pName]) prodMap[pName] = { qty: 0, gross: 0, net: 0 };
          prodMap[pName].qty += qty;
          prodMap[pName].gross += lineTotal;
          // Net for item is harder without line-level discount. approx:
          prodMap[pName].net += lineTotal;

          // Category Key
          const cat = item.category || 'Uncategorized';
          if (!catMap[cat]) catMap[cat] = { qty: 0, gross: 0, net: 0 };
          catMap[cat].qty += qty;
          catMap[cat].gross += lineTotal;
          catMap[cat].net += lineTotal;
        });
      }
    });

    // Sum Returns Value
    returns.forEach(r => {
      totalReturns += (r.total || 0);
    });

    const netSales = grossSales - totalDiscounts - totalReturns;
    const profit = netSales - cogs;

    return {
      meta: { branchId, fromDate, toDate },
      receipts: finishedSales, // Active valid sales
      allReceipts: receipts,   // Includes returns/voids for logs
      returns: returns,
      products: rawProducts,
      expenses: rawExpenses,
      shifts: shifts,
      // Pre-calculated Golden Numbers
      totals: {
        grossSales,
        netSales,
        cogs,
        profit,
        discounts: totalDiscounts,
        returns: totalReturns,
        tax: totalTax
      },
      // Aggregates
      aggs: {
        category: catMap,
        cashier: cashierMap,
        product: prodMap,
        payment: payMap
      }
    };
  }

  // === 6. MAIN RENDER CONTROLLER ===
  async function refreshReports() {
    const btn = document.querySelector('button[onclick="refreshReports()"] .material-symbols-outlined');
    if (btn) btn.classList.add('animate-spin');

    try {
      const context = await buildReportContext();
      console.log("📊 Report Context Built:", context);

      const activeTab = document.querySelector('.report-tab.active')?.dataset.tab || 'live';

      switch (activeTab) {
        case 'live':
          renderLiveMonitor(context);
          break;
        case 'sales':
          renderSalesStats(context);
          break;
        case 'inventory-report':
          if (typeof renderInventoryReport === 'function') renderInventoryReport(context);
          break;
      }

    } catch (error) {
      console.error("❌ Report Refresh Failed:", error);
    } finally {
      if (btn) btn.classList.remove('animate-spin');
    }
  }

  // === 7. LIVE MONITOR RENDERER (Phase 2) ===
  function renderLiveMonitor(ctx) {
    const { receipts, totals } = ctx;

    // 1. KPI Cards
    document.getElementById('live-net-sales').textContent = totals.netSales.toFixed(2);
    document.getElementById('live-orders-count').textContent = receipts.length;

    const avgTicket = receipts.length > 0 ? (totals.netSales / receipts.length) : 0;
    document.getElementById('live-avg-ticket').textContent = avgTicket.toFixed(2);

    document.getElementById('live-gross-profit').textContent = totals.profit.toFixed(2);
    document.getElementById('live-discounts').textContent = totals.discounts.toFixed(2);
    document.getElementById('live-returns').textContent = totals.returns.toFixed(2);

    // 2. Charts
    renderSalesPerHourChart(receipts);
    renderPaymentPie(receipts, 'chart-payment-method');

    // 3. Recent Orders
    renderRecentOrders(ctx.allReceipts);

    // 4. Shift Bar (Mock for now, will connect to real session later)
    // If we have shift data in context
    const shiftBar = document.getElementById('live-shift-bar');
    if (shiftBar) {
      // Check for active shift logic if available
      // For now, hide it unless we have explicit shift obj
      shiftBar.classList.add('hidden');
    }
  }

  // === 8. SALES DEEP DIVE RENDERER (Phase 3) ===
  function renderSalesStats(ctx) {
    const { totals, receipts, aggs } = ctx;

    // 1. Summary Cards
    document.getElementById('sales-gross').textContent = totals.grossSales.toFixed(2);
    document.getElementById('sales-net').textContent = totals.netSales.toFixed(2);
    document.getElementById('sales-tax').textContent = totals.tax.toFixed(2);
    document.getElementById('sales-orders').textContent = receipts.length;

    const avg = receipts.length > 0 ? (totals.netSales / receipts.length) : 0;
    document.getElementById('sales-avg').textContent = avg.toFixed(2);

    // 2. Charts
    renderPaymentPie(receipts, 'chart-sales-payment');
    renderCategoryChart(aggs.category);

    // 3. Tables
    renderCategoryTable(aggs.category, totals.netSales);
    renderCashierTable(aggs.cashier);
    renderTopProductsTable(aggs.product);
  }

  // --- CHART HELPERS ---
  function renderSalesPerHourChart(receipts) {
    const canvas = document.getElementById('chart-sales-hour');
    if (!canvas) return;

    // Destroy old
    if (window.salesHourChart) window.salesHourChart.destroy();

    // 24-hour buckets
    const buckets = new Array(24).fill(0);
    receipts.forEach(r => {
      const h = new Date(r.date).getHours();
      buckets[h] += (r.total || 0);
    });

    // Create Labels (00:00 - 23:00)
    const labels = buckets.map((_, i) => `${i}:00`);

    window.salesHourChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Sales (EGP)',
          data: buckets,
          borderColor: '#2563eb', // Blue-600
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { borderDash: [2, 2] } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderPaymentPie(receipts, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // We reuse this logic for both Live and Sales tabs, keep robust
    // Store instances in a map/window prop to destroy correctly or unique IDs
    // For simplicity, we attach to window by ID
    const chartKey = canvasId === 'chart-payment-method' ? 'paymentPieChartLive' : 'paymentPieChartSales';
    if (window[chartKey]) window[chartKey].destroy();

    let cash = 0, card = 0, wallet = 0;
    receipts.forEach(r => {
      const m = (r.paymentMethod || 'cash').toLowerCase();
      if (m.includes('card') || m.includes('visa')) card += r.total;
      else if (m.includes('wallet') || m.includes('mobile')) wallet += r.total;
      else cash += r.total;
    });

    window[chartKey] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Cash', 'Card', 'Wallet'],
        datasets: [{
          data: [cash, card, wallet],
          backgroundColor: ['#10b981', '#3b82f6', '#8b5cf6'], // Green, Blue, Purple
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
      }
    });
  }

  function renderCategoryChart(catMap) {
    const canvas = document.getElementById('chart-sales-category');
    if (!canvas) return;
    if (window.categoryChart) window.categoryChart.destroy();

    const labels = Object.keys(catMap);
    const data = Object.values(catMap).map(c => c.net);

    window.categoryChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Sales',
          data: data,
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { grid: { display: false } } },
        plugins: { legend: { display: false } }
      }
    });
  }

  // --- TABLE HELPERS ---
  function renderCategoryTable(catMap, totalNet) {
    const tbody = document.getElementById('table-sales-category');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.entries(catMap)
      .sort((a, b) => b[1].net - a[1].net)
      .forEach(([cat, stats]) => {
        const pct = totalNet > 0 ? (stats.net / totalNet) * 100 : 0;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-50";
        tr.innerHTML = `
                <td class="px-4 py-2 font-medium text-slate-700">${cat}</td>
                <td class="px-4 py-2">${stats.qty}</td>
                <td class="px-4 py-2 font-bold">${stats.net.toFixed(2)}</td>
                <td class="px-4 py-2 text-slate-400">${pct.toFixed(1)}%</td>
              `;
        tbody.appendChild(tr);
      });
  }

  function renderCashierTable(cashierMap) {
    const tbody = document.getElementById('table-sales-cashier');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.entries(cashierMap)
      .sort((a, b) => b[1].net - a[1].net)
      .forEach(([name, stats]) => {
        const avg = stats.count > 0 ? stats.net / stats.count : 0;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-50";
        tr.innerHTML = `
                <td class="px-4 py-2 font-medium text-slate-700">${name}</td>
                <td class="px-4 py-2">${stats.count}</td>
                <td class="px-4 py-2 font-bold">${stats.net.toFixed(2)}</td>
                <td class="px-4 py-2 text-slate-400">${avg.toFixed(2)}</td>
              `;
        tbody.appendChild(tr);
      });
  }

  function renderTopProductsTable(prodMap) {
    const tbody = document.getElementById('table-sales-products');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.entries(prodMap)
      .sort((a, b) => b[1].net - a[1].net)
      .slice(0, 20) // Top 20
      .forEach(([name, stats]) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-50";
        tr.innerHTML = `
                <td class="px-6 py-3 font-medium text-slate-700">${name}</td>
                <td class="px-6 py-3">${stats.qty}</td>
                <td class="px-6 py-3 text-slate-500">${stats.gross.toFixed(2)}</td>
                <td class="px-6 py-3 font-bold text-slate-800">${stats.net.toFixed(2)}</td>
              `;
        tbody.appendChild(tr);
      });
  }

  function renderRecentOrders(allReceipts) {
    const tbody = document.getElementById('live-recent-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Sort by date desc, take 10
    const recent = [...allReceipts].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    recent.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer";
      tr.onclick = () => alert(`Opening Receipt #${r.id} details...`); // Placeholder for modal

      const time = new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Status Logic
      let statusBadge = '<span class="text-xs font-bold text-green-600">Completed</span>';
      if (r.status?.includes('return')) statusBadge = '<span class="text-xs font-bold text-red-600">Returned</span>';

      tr.innerHTML = `
                <td class="px-6 py-3 font-mono text-slate-500">#${(r.id || '').toString().slice(-6)}</td>
                <td class="px-6 py-3 text-xs text-slate-400">${r.branchId || '-'}</td>
                <td class="px-6 py-3 font-bold text-slate-700">${(r.total || 0).toFixed(2)}</td>
                <td class="px-6 py-3 capitalize text-xs">${r.paymentMethod || 'Cash'}</td>
                <td class="px-6 py-3 text-sm">${r.cashier || '-'}</td>
                <td class="px-6 py-3">${statusBadge}</td>
                <td class="px-6 py-3 text-slate-400 text-xs">${time}</td>
            `;
      tbody.appendChild(tr);
    });
  }

  // Initial Load
  refreshReports();
});
