/**
 * TASGHHEEL REPORTS APP
 * Main Controller & UI Binding
 * Phase 7: Final Architecture
 */

document.addEventListener('DOMContentLoaded', async () => {
  // === 1. HELPER: Current Tab ===
  window.getCurrentTab = () => document.querySelector('.report-tab.active')?.dataset.tab || 'live';

  // === 2. TRANSLATION ===
  const t = (keyOrEn, ar) => {
    const lang = localStorage.getItem('pos_language') || 'en';
    if (ar) return lang === 'ar' ? ar : keyOrEn;
    if (window.translations && window.translations[keyOrEn]) return window.translations[keyOrEn][lang];
    return keyOrEn;
  };

  // === 3. INITIALIZATION ===
  const branchFilter = document.getElementById('branchFilter');
  const fromDateInput = document.getElementById('startDate');

  // Set Default Date Range
  setDateRange('today');

  // Load Branches
  await loadBranches();

  // Listeners
  window.addEventListener('languageChanged', () => refreshReports());
  if (branchFilter) branchFilter.addEventListener('change', () => refreshReports());

  // Global Access
  window.refreshReports = refreshReports;
  window.setDateRange = setDateRange;

  // Tab Switching
  document.querySelectorAll('.report-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.report-tab').forEach(btn => btn.classList.remove('active'));
      tab.classList.add('active');

      const selected = tab.dataset.tab;
      document.querySelectorAll('.report-card').forEach(card => card.style.display = 'none');

      const card = document.getElementById('card-' + selected);
      if (card) card.style.display = 'block';

      refreshReports();
    });
  });

  // === 4. BRANCH LOADER ===
  async function loadBranches() {
    if (!branchFilter) return;
    try {
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

      const saved = localStorage.getItem('report_branch_filter');
      if (saved && branchFilter.querySelector(`option[value="${saved}"]`)) branchFilter.value = saved;
    } catch (e) {
      console.error("Failed to load branches", e);
      branchFilter.innerHTML = `<option value="all">${t('All Branches', 'كل الفروع')}</option>`;
    }
  }

  // === 5. DATE PRESETS ===
  function setDateRange(preset) {
    if (!window.ReportDateUtils) return;
    const range = window.ReportDateUtils.getRange(preset);

    const fmt = d => d.toISOString().split('T')[0];

    // Update Inputs
    const sInput = document.getElementById('startDate');
    const eInput = document.getElementById('endDate');
    if (sInput) sInput.value = fmt(range.start);
    if (eInput) eInput.value = fmt(range.end);

    // Update Preset Value for Engine
    const presetInput = document.getElementById('datePreset');
    if (presetInput) presetInput.value = preset;

    refreshReports();
  }

  // Handle Manual Date Changes
  window.handleCustomDateChange = () => {
    const presetInput = document.getElementById('datePreset');
    if (presetInput) presetInput.value = 'custom';
    refreshReports();
  };

  // === 6. MAIN CONTROLLER ===
  async function refreshReports() {
    const btn = document.querySelector('button[onclick="refreshReports()"] .material-symbols-outlined');
    if (btn) btn.classList.add('animate-spin');

    const activeTab = getCurrentTab();
    const activeCard = document.getElementById('card-' + activeTab);
    if (activeCard) activeCard.classList.add('opacity-50', 'pointer-events-none');

    try {
      // 1. Build Context using Engine
      // Check if Engine is loaded
      if (!window.buildReportContext) {
        console.error("Report Engine not loaded!");
        return;
      }

      const ctx = await window.buildReportContext();
      console.log("📊 Context:", ctx);

      const activeTab = getCurrentTab();

      // 3. User Permission Check
      let user = {};
      if (window.getCurrentUser) {
        user = window.getCurrentUser() || {};
      } else {
        user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      }

      console.log('👤 Current User Context:', user);

      const canEdit = user.role === 'admin' || user.role === 'manager' || user.isAdmin === true;
      const canViewDelivery = canEdit || (user.permissions && user.permissions.includes('view_reports_delivery'));

      const addBtn = document.getElementById('btn-add-expense');
      if (addBtn) addBtn.classList.toggle('hidden', !canEdit);

      const delTab = document.querySelector('[data-tab="delivery"]');
      if (delTab) delTab.classList.toggle('hidden', !canViewDelivery);

      // 4. Render View
      switch (activeTab) {
        case 'live': renderLiveMonitor(ctx); break;
        case 'sales': renderSalesStats(ctx); break;
        case 'cogs':
          if (canEdit) renderCOGSReport(ctx);
          else {
            console.warn('⛔ Access Denied to COGS. User Role:', user.role);
            alert("Access Denied: You need Admin or Manager privileges.");
            document.querySelector('[data-tab="live"]').click();
          }
          break;
        case 'expenses': renderExpensesReport(ctx); break;
        case 'inventory-report': renderInventoryReport(ctx); break;
        case 'delivery':
          if (canViewDelivery) renderDeliveryReport(ctx);
          else {
            alert("Access Denied: You need permissions to view Delivery Reports.");
            document.querySelector('[data-tab="live"]').click();
          }
          break;
      }

    } catch (error) {
      console.error("❌ Refresh Failed:", error);
    } finally {
      if (btn) btn.classList.remove('animate-spin');
      if (activeCard) activeCard.classList.remove('opacity-50', 'pointer-events-none');
    }
  }

  // === 7. VIEW RENDERERS ===

  // --- LIVE MONITOR ---
  function renderLiveMonitor(ctx) {
    const { receipts, totals } = ctx;

    document.getElementById('live-net-sales').textContent = totals.netSales.toFixed(2);
    document.getElementById('live-orders-count').textContent = receipts.length;
    document.getElementById('live-avg-ticket').textContent = receipts.length > 0 ? (totals.netSales / receipts.length).toFixed(2) : "0.00";
    document.getElementById('live-gross-profit').textContent = totals.profit.toFixed(2);
    document.getElementById('live-discounts').textContent = totals.discounts.toFixed(2);
    document.getElementById('live-returns').textContent = totals.returns.toFixed(2);

    window.ReportCharts.renderSalesPerHour(receipts);
    window.ReportCharts.renderPaymentDistribution(receipts, 'chart-payment-method');

    // Recent Orders Table
    const tbody = document.getElementById('live-recent-body');
    if (tbody) {
      tbody.innerHTML = '';
      ctx.receipts.slice(0, 10).forEach(r => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-50 transition-colors cursor-pointer";
        tr.onclick = () => showReceiptModal ? showReceiptModal(r) : alert('Receipt detail not implemented');
        tr.innerHTML = `
                <td class="px-4 py-3 font-medium">#${r.invoiceNumber || r.id.slice(-6)}</td>
                <td class="px-4 py-3 text-slate-500 text-xs">${new Date(r.date || r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td class="px-4 py-3 text-slate-500 text-xs">${r.branchId || 'Main'}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">Finished</span></td>
                <td class="px-4 py-3 font-bold text-slate-800">${(r.total || 0).toFixed(2)}</td>
             `;
        tbody.appendChild(tr);
      });
    }
  }

  // --- SALES TAB ---
  function renderSalesStats(ctx) {
    const { totals, receipts, aggs } = ctx;

    document.getElementById('sales-gross').textContent = totals.grossSales.toFixed(2);
    document.getElementById('sales-net').textContent = totals.netSales.toFixed(2);
    document.getElementById('sales-tax').textContent = totals.tax.toFixed(2);
    document.getElementById('sales-orders').textContent = receipts.length;
    document.getElementById('sales-avg').textContent = receipts.length > 0 ? (totals.netSales / receipts.length).toFixed(2) : "0.00";

    window.ReportCharts.renderPaymentDistribution(receipts, 'chart-sales-payment');
    window.ReportCharts.renderCategorySales(aggs.category);

    // Tables
    renderGenericTable('table-sales-category', Object.entries(aggs.category).sort((a, b) => b[1].net - a[1].net), (k, v) => [
      k, v.qty, v.net.toFixed(2), ((v.net / totals.netSales) * 100).toFixed(1) + '%'
    ]);

    renderGenericTable('table-sales-cashier', Object.entries(aggs.cashier).sort((a, b) => b[1].net - a[1].net), (k, v) => [
      k, v.count, v.net.toFixed(2), (v.count > 0 ? v.net / v.count : 0).toFixed(2)
    ]);

    renderGenericTable('table-sales-products', Object.entries(aggs.product).sort((a, b) => b[1].net - a[1].net).slice(0, 20), (k, v) => [
      k, v.qty, v.gross.toFixed(2), v.net.toFixed(2)
    ]);
  }

  // --- COGS TAB ---
  function renderCOGSReport(ctx) {
    const { totals, receipts, aggs } = ctx;

    document.getElementById('cogs-total').textContent = totals.cogs.toFixed(2) + ' EGP';
    document.getElementById('cogs-profit').textContent = totals.profit.toFixed(2) + ' EGP';
    document.getElementById('cogs-margin').textContent = totals.marginPercent.toFixed(1) + '%';

    const avg = receipts.length > 0 ? totals.cogs / receipts.length : 0;
    document.getElementById('cogs-avg-cost').textContent = avg.toFixed(2) + ' EGP';

    window.ReportCharts.renderCOGSBreakdown(totals);
    window.ReportCharts.renderCOGSCategory(aggs.category);

    // Tables
    renderGenericTable('table-cogs-products', Object.entries(aggs.product).sort((a, b) => b[1].profit - a[1].profit).slice(0, 50), (k, v) => {
      const margin = v.net > 0 ? (v.profit / v.net) * 100 : 0;
      return [k, v.qty, v.cost.toFixed(2), v.profit.toFixed(2), margin.toFixed(1) + '%'];
    });

    renderGenericTable('table-cogs-categories', Object.entries(aggs.category).sort((a, b) => b[1].profit - a[1].profit), (k, v) => {
      const margin = v.net > 0 ? (v.profit / v.net) * 100 : 0;
      return [k, v.cost.toFixed(2), v.net.toFixed(2), v.profit.toFixed(2), margin.toFixed(1) + '%'];
    });

    // Low Margin Alerts
    const tbody = document.getElementById('table-cogs-alerts');
    if (tbody) {
      tbody.innerHTML = '';
      Object.entries(aggs.product).filter(([_, v]) => {
        const m = v.net > 0 ? (v.profit / v.net) * 100 : 0;
        return m < 20 && v.qty > 0;
      }).forEach(([k, v]) => {
        const unitCost = v.qty > 0 ? v.cost / v.qty : 0;
        const unitPrice = v.qty > 0 ? v.net / v.qty : 0;
        const margin = v.net > 0 ? (v.profit / v.net) * 100 : 0;
        const sugg = unitCost / 0.7;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-red-50 border-b border-red-100 bg-red-50/30";
        tr.innerHTML = `
                 <td class="px-6 py-3 font-medium">${k}</td>
                 <td class="px-6 py-3 text-slate-500">${unitCost.toFixed(2)}</td>
                 <td class="px-6 py-3 text-red-600 font-bold">${unitPrice.toFixed(2)}</td>
                 <td class="px-6 py-3 text-xs font-bold text-red-600">${margin.toFixed(1)}%</td>
                 <td class="px-6 py-3 font-bold text-green-700">${sugg.toFixed(2)}</td>
              `;
        tbody.appendChild(tr);
      });
    }
  }

  // --- EXPENSES TAB ---
  function renderExpensesReport(ctx) {
    const { totals, expenses, aggs, meta } = ctx;

    document.getElementById('expenses-total').textContent = totals.expenses.toFixed(2);
    const days = Math.max(1, Math.ceil((meta.toDate - meta.fromDate) / (1000 * 60 * 60 * 24)));
    document.getElementById('expenses-daily-avg').textContent = (totals.expenses / days).toFixed(2);
    document.getElementById('expenses-largest').textContent = totals.largestExpense.toFixed(2);
    document.getElementById('expenses-largest-name').textContent = totals.largestExpenseName;
    document.getElementById('expenses-net-profit').textContent = totals.netProfit.toFixed(2);

    window.ReportCharts.renderExpenseCategory(aggs.expenseCategory);
    window.ReportCharts.renderExpenseTrend(aggs.expenseDaily);

    // Table
    const tbody = document.getElementById('table-expenses');
    if (tbody) {
      tbody.innerHTML = '';
      expenses.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(e => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-50";
        tr.innerHTML = `
                  <td class="px-6 py-3">${new Date(e.date).toLocaleDateString()}</td>
                  <td class="px-6 py-3"><span class="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600">${e.category}</span></td>
                  <td class="px-6 py-3 font-medium text-slate-800">${e.description}</td>
                  <td class="px-6 py-3 text-xs text-slate-400">${e.branchId || 'All'}</td>
                  <td class="px-6 py-3 text-xs text-slate-400">${e.createdBy || '-'}</td>
                  <td class="px-6 py-3 font-bold text-red-600">-${parseFloat(e.amount).toFixed(2)}</td>
              `;
        tbody.appendChild(tr);
      });
    }
  }

  // --- INVENTORY TAB ---
  function renderInventoryReport(ctx) {
    const { totals, products, aggs } = ctx;

    document.getElementById('inv-stock-cost').textContent = totals.stockCost.toFixed(2) + ' EGP';
    document.getElementById('inv-retail-value').textContent = totals.retailValue.toFixed(2) + ' EGP';
    document.getElementById('inv-expected-profit').textContent = totals.expectedStockProfit.toFixed(2) + ' EGP';
    document.getElementById('inv-low-stock').textContent = totals.lowStockCount;

    window.ReportCharts.renderStockCategory(aggs.stockCategory);
    window.ReportCharts.renderTopAssets(products);

    document.getElementById('aging-0-7').textContent = aggs.stockAging['0-7'] + ' Items';
    document.getElementById('aging-8-30').textContent = aggs.stockAging['8-30'] + ' Items';
    document.getElementById('aging-31-90').textContent = aggs.stockAging['31-90'] + ' Items';
    document.getElementById('aging-90').textContent = aggs.stockAging['90+'] + ' Items';

    // Table
    const tbody = document.getElementById('table-inventory-health');
    if (tbody) {
      tbody.innerHTML = '';
      products.sort((a, b) => b._computed.stockCost - a._computed.stockCost).slice(0, 100).forEach(p => {
        const c = p._computed;
        const color = c.health === 'Healthy' ? 'text-green-600' : c.health === 'Slow' ? 'text-amber-600' : 'text-red-600';
        const icon = c.health === 'Healthy' ? 'check_circle' : c.health === 'Slow' ? 'warning' : 'dangerous';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-50";
        tr.innerHTML = `
                  <td class="px-6 py-3 font-medium text-slate-800">${p.name}</td>
                  <td class="px-6 py-3 text-xs text-slate-500">${p.category || '-'}</td>
                  <td class="px-6 py-3">${p.qty}</td>
                  <td class="px-6 py-3 text-amber-600">${parseFloat(p.cost || 0).toFixed(2)}</td>
                  <td class="px-6 py-3 font-bold">${c.stockCost.toFixed(2)}</td>
                  <td class="px-6 py-3 text-xs text-slate-400">${p.lastSoldAt ? new Date(p.lastSoldAt).toLocaleDateString() : 'Never'}</td>
                  <td class="px-6 py-3 text-xs">${c.daysIdle > 900 ? '999+' : c.daysIdle} days</td>
                  <td class="px-6 py-3 flex items-center gap-1 font-bold text-xs ${color}">
                      <span class="material-symbols-outlined text-[16px]">${icon}</span> ${c.health}
                  </td>
              `;
      });
    }
  }

  // --- DELIVERY TAB ---
  function renderDeliveryReport(ctx) {
    const { delivery } = ctx;

    // 1. KPIs
    document.getElementById('del-total-revenue').textContent = delivery.totalRevenue.toFixed(2);
    document.getElementById('del-total-fees').textContent = delivery.totalFees.toFixed(2);
    document.getElementById('del-total-orders').textContent = delivery.count;
    document.getElementById('del-avg-fee').textContent = delivery.avgFee.toFixed(2);

    // 2. Charts
    window.ReportCharts.renderDeliveryFeeTrend(delivery.dailyFees);
    window.ReportCharts.renderDeliverySources(delivery.bySource);

    // 3. Tables

    // Drivers Table
    const driverBody = document.getElementById('table-delivery-drivers');
    if (driverBody) {
      driverBody.innerHTML = '';
      Object.entries(delivery.byDriver).sort((a, b) => b[1].count - a[1].count).forEach(([driver, stats]) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-50";
        tr.innerHTML = `
                <td class="px-4 py-2 font-medium">${driver}</td>
                <td class="px-4 py-2">${stats.count}</td>
                <td class="px-4 py-2 font-bold text-purple-600">${stats.fees.toFixed(2)}</td>
                <td class="px-4 py-2 text-slate-500">${stats.total.toFixed(2)}</td>
            `;
        driverBody.appendChild(tr);
      });
    }

    // Source Table
    const sourceBody = document.getElementById('table-delivery-sources');
    if (sourceBody) {
      sourceBody.innerHTML = '';
      Object.entries(delivery.bySource).sort((a, b) => b[1].count - a[1].count).forEach(([source, stats]) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-50";
        tr.innerHTML = `
                <td class="px-4 py-2 font-bold text-slate-700">${source}</td>
                <td class="px-4 py-2">${stats.count}</td>
                <td class="px-4 py-2 text-green-600 font-bold">${stats.sales.toFixed(2)}</td>
            `;
        sourceBody.appendChild(tr);
      });
    }
  }

  // === UTILS ===
  function renderGenericTable(id, data, mapFn) {
    const tbody = document.getElementById(id);
    if (!tbody) return;
    tbody.innerHTML = '';
    data.forEach(item => {
      const vals = mapFn(item[0], item[1]);
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-50 border-b border-slate-50";
      let html = '';
      vals.forEach((v, i) => {
        const bold = i === 2 || i === 3 ? 'font-bold' : ''; // Heuristic for amount cols
        html += `<td class="px-4 py-2 ${bold}">${v}</td>`;
      });
      tr.innerHTML = html;
      tbody.appendChild(tr);
    });
  }

  // === ACTIONS ===
  window.openExpenseModal = () => document.getElementById('modal-add-expense').classList.remove('hidden');
  window.closeExpenseModal = () => document.getElementById('modal-add-expense').classList.add('hidden');

  // Re-attach handleSaveExpense if needed or keep inline? Layout suggested inline in previous phase
  // But strictly we should define it here
  window.handleSaveExpense = async (e) => {
    e.preventDefault();
    // ... (Same logic as Phase 5) ...
    // Ideally this should invoke a Service in engine, but for now we keep simple logic here
    const formData = new FormData(e.target);
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const newExpense = {
      id: 'exp_' + Date.now(),
      date: formData.get('date'),
      category: formData.get('category'),
      description: formData.get('description'),
      amount: parseFloat(formData.get('amount')),
      branchId: formData.get('branchId'),
      createdBy: user.username || 'Admin',
      createdAt: new Date().toISOString()
    };

    // Save
    if (!window.DataCache) window.DataCache = {};
    if (!window.DataCache.expenses) window.DataCache.expenses = [];
    window.DataCache.expenses.push(newExpense);

    const stored = JSON.parse(localStorage.getItem('local_expenses') || '[]');
    stored.push(newExpense);
    localStorage.setItem('local_expenses', JSON.stringify(stored));

    alert("Expense Saved");
    closeExpenseModal();
    refreshReports();
  };
});
