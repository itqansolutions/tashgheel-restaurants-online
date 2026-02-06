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

    finishedSales.forEach(r => {
      grossSales += (r.subtotal || r.total); // Usually Subtotal is before discount. If not available, use total + discount
      if (!r.subtotal && r.total) {
        grossSales += (r.total + (r.discount || 0));
      }

      totalDiscounts += (r.discount || 0);

      // COGS Calc
      if (r.items) {
        r.items.forEach(item => {
          // Check for service items (non-stock)
          if (item.code && item.code.startsWith('SVC-')) return;
          const qty = item.qty || 1;
          const cost = item.cost || item.unitCost || 0;
          cogs += (qty * cost);
        });
      }
    });

    // Sum Returns Value
    returns.forEach(r => {
      totalReturns += (r.total || 0); // Return total is usually the money back
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
        returns: totalReturns
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
          if (typeof renderSalesStats === 'function') await renderSalesStats(context);
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
    const { receipts, totals, returns } = ctx;

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
    renderPaymentPie(receipts);

    // 3. Recent Orders
    renderRecentOrders(ctx.allReceipts); // Show all including returns/voids

    // 4. Shift Bar (Mock for now, will connect to real session later)
    // If we have shift data in context
    const shiftBar = document.getElementById('live-shift-bar');
    if (shiftBar) {
      // Check for active shift logic if available
      // For now, hide it unless we have explicit shift obj
      shiftBar.classList.add('hidden');
    }
  }

  function renderSalesPerHourChart(receipts) {
    const ctx = document.getElementById('chart-sales-hour');
    if (!ctx) return;

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

    window.salesHourChart = new Chart(ctx, {
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

  function renderPaymentPie(receipts) {
    const ctx = document.getElementById('chart-payment-method');
    if (!ctx) return;

    if (window.paymentPieChart) window.paymentPieChart.destroy();

    let cash = 0, card = 0, wallet = 0;
    receipts.forEach(r => {
      const m = (r.paymentMethod || 'cash').toLowerCase();
      if (m.includes('card') || m.includes('visa')) card += r.total;
      else if (m.includes('wallet') || m.includes('mobile')) wallet += r.total;
      else cash += r.total;
    });

    window.paymentPieChart = new Chart(ctx, {
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
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
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
