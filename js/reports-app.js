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

    // --- DATA FETCHING (Abstraction over Local/Cloud) ---
    let rawReceipts = [];
    let rawReturns = [];
    let rawProducts = [];
    let rawExpenses = [];
    let shifts = [];

    // Try Loading from centralized DataCache or API
    // For Reports, we prefer fresh data if online, or robust cache
    if (window.electronAPI) {
      try {
        // If "All Branches" and online -> fetch aggregated? 
        // Currently Electron API might handle local DB. 
        // Implementation Refinement: We load ALL local data available.
        // In a real SaaS, this would be an API call: /reports/aggregate?from=..&to=..&branch=..

        // For Phase 1, we assume we are working with Client-Side Aggregation of available data
        // In strict SaaS mode, we would replace this with `await apiFetch('/reports/summary', ...)`

        // FALLBACK: Load from DB or WebAdapter Cache
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
      receipts = receipts.filter(r => r.branchId === branchId || !r.branchId); // Keep legacy (null) if strict mode off? No, strict:
      // receipts = receipts.filter(r => r.branchId == branchId);
    }

    // 2. Filter by Date
    if (fromDate && toDate) {
      receipts = receipts.filter(r => {
        const d = new Date(r.date);
        return d >= fromDate && d <= toDate;
      });
      // Also filter expenses
      rawExpenses = rawExpenses.filter(e => {
        const d = new Date(e.date);
        return d >= fromDate && d <= toDate;
      });
    }

    // --- SEGMENTATION ---
    const finishedSales = receipts.filter(r => r.status === 'finished');
    // Define Returns: could be separate collection OR status='return'
    // Assuming current architecture stores returns as sales with negative status or distinct collection?
    // Let's assume 'full_return' status or 'returns' collection
    let returns = receipts.filter(r => r.status === 'full_return' || r.status === 'partial_return');
    if (window.DataCache && window.DataCache.returns) {
      // If returns are stored separately
      let separateReturns = window.DataCache.returns;
      if (branchId !== 'all') separateReturns = separateReturns.filter(r => r.branchId == branchId);
      if (fromDate) separateReturns = separateReturns.filter(r => new Date(r.date) >= fromDate && new Date(r.date) <= toDate);
      returns = [...returns, ...separateReturns];
    }

    return {
      meta: { branchId, fromDate, toDate },
      receipts: finishedSales,
      allReceipts: receipts, // Includes pending/cancelled
      returns: returns,
      products: rawProducts,
      expenses: rawExpenses,
      shifts: shifts // TODO: Implement shifts loading
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

      // Dispatch to specific renderers
      // (Phase 2-7 placeholders will go here)
      switch (activeTab) {
        case 'live':
          if (typeof renderLiveMonitor === 'function') await renderLiveMonitor(context);
          break;
        case 'sales':
          if (typeof renderSalesStats === 'function') await renderSalesStats(context);
          break;
        // Add other cases as we implement them
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

  // === TEMPORARY PLACEHOLDERS FOR EXISTING TABS (To prevent breakage during Phase 1) ===
  window.renderLiveMonitor = async (ctx) => {
    // Basic connectivity test for Phase 1
    console.log("Rendering Live Monitor with Context:", ctx);
    // Reuse existing logic but populated from Context
    const totalRev = ctx.receipts.reduce((sum, r) => sum + (r.total || 0), 0);
    document.getElementById('live-revenue').textContent = totalRev.toFixed(2);
    document.getElementById('live-orders').textContent = ctx.receipts.length;
  };

  // Initial Load
  refreshReports();
});
