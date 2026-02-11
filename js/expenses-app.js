// expenses-app.js
window.currentPage = 'expenses';
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

  const expenseDateInput = document.getElementById('expenseDate');
  const sellerSelect = document.getElementById('expenseSeller');
  const filterSeller = document.getElementById('filterSeller');
  const totalExpenses = document.getElementById('total-expenses');

  // Initialize dates
  if (expenseDateInput) expenseDateInput.valueAsDate = new Date();
  if (document.getElementById('filterDate')) document.getElementById('filterDate').valueAsDate = new Date();

  // Load Initial Data
  loadSellers();
  loadExpenses();

  // Check and run migration if needed
  checkAndMigrateExpenses();

  // Re-render when language changes
  window.addEventListener('languageChanged', () => {
    loadExpenses();
  });

  // === Sellers Loading ===
  function loadSellers() {
    const salesmen = JSON.parse(localStorage.getItem("salesmen") || "[]");
    if (!sellerSelect || !filterSeller) return;

    sellerSelect.innerHTML = '<option value="">--</option>';
    filterSeller.innerHTML = '<option value="">--</option>';

    salesmen.forEach(s => {
      const name = s.name;
      if (!name) return;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sellerSelect.appendChild(opt);

      const opt2 = opt.cloneNode(true);
      filterSeller.appendChild(opt2);
    });
  }

  // === Add Expense (Server) ===
  window.addExpense = async function () {
    const date = expenseDateInput.value;
    const seller = sellerSelect.value;
    const desc = document.getElementById('expenseDesc').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const method = document.getElementById('expenseMethod').value;

    if (!date || !seller || !desc || isNaN(amount) || amount <= 0) {
      alert(t("Please fill all fields correctly", "يرجى ملء جميع الحقول بشكل صحيح"));
      return;
    }

    try {
      const payload = {
        date,
        seller,
        description: desc,
        amount,
        method,
        category: 'General',
        notes: '',
        // type defaults to 'expense' on server
      };

      await window.apiFetch('/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      loadExpenses();
      clearForm();
      // Removed: alert('Saved'); to keep flow smooth, validation is enough
    } catch (err) {
      console.error("Failed to save expense:", err);
      alert(t("Failed to save expense", "فشل حفظ المصروف") + ": " + err.message);
    }
  };

  function clearForm() {
    document.getElementById('expenseDesc').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseMethod').value = 'cash';
  }

  // === Render Logic (Server + DB Fallback) ===
  async function loadExpenses() {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;

    // Show loading state if empty
    if (tbody.children.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><div class="inline-block w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div></td></tr>`;
    }

    try {
      // 1. Fetch Manual Expenses from Server
      const selectedDate = document.getElementById('filterDate').value;
      const selectedSeller = filterSeller.value;

      let url = '/expenses?';
      if (selectedDate) url += `from=${selectedDate}&to=${selectedDate}&`;
      if (selectedSeller) url += `category=General&`; // Basic filtering, refine if needed

      const serverExpenses = await window.apiFetch(url);

      // 2. Vendor Payments (from DB - Local Cache of Secure Data)
      // These are effectively "auto" expenses
      // Ideally we fetch these from server too, but for now we keep hybrid to match logic
      const vendorPayments = window.DB?.getVendorPayments() || [];
      const vendors = window.DB?.getVendors() || [];

      const paymentExpenses = vendorPayments.map(vp => {
        const vendor = vendors.find(v => v.id === vp.vendorId);
        return {
          id: vp.id,
          date: vp.date,
          seller: vendor?.name || t('Vendor', 'مورد'),
          description: t('Vendor Payment', 'دفعة مورد') + (vp.notes ? ` - ${vp.notes}` : ''),
          amount: vp.amount,
          method: 'cash',
          type: 'vendor_payment',
          source: 'auto'
        };
      });

      // Combined
      let allExpenses = [...serverExpenses.map(e => ({ ...e, source: 'manual' })), ...paymentExpenses];

      // Client-side filtering for joined data
      allExpenses = allExpenses.filter(e => {
        const matchDate = selectedDate ? e.date === selectedDate : true;
        const matchSeller = selectedSeller ? e.seller === selectedSeller : true;
        return matchDate && matchSeller;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));

      renderTable(allExpenses);

    } catch (err) {
      console.error("Failed to load expenses:", err);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red-500 py-4">${t('Error loading data', 'خطأ في تحميل البيانات')}</td></tr>`;
    }
  }

  function renderTable(expenses) {
    const tbody = document.getElementById('expenses-table-body');
    tbody.innerHTML = '';

    if (expenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${t('No expenses found', 'لا توجد مصاريف')}</td></tr>`;
      document.getElementById('total-expenses').textContent = '0.00';
      return;
    }

    let total = 0;
    expenses.forEach((e, idx) => {
      const badge = e.type === 'vendor_payment'
        ? `<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-200 ml-2 uppercase tracking-wide inline-block align-middle">${t('Vendor', 'مورد')}</span>`
        : '';

      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-50 transition-colors group";

      tr.innerHTML = `
              <td class="px-4 py-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
              <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${e.date}</td>
              <td class="px-4 py-3 font-medium text-slate-800">${e.seller || '-'}</td>
              <td class="px-4 py-3 text-slate-600 max-w-xs truncate" title="${e.description}">
                  ${e.description} ${badge}
              </td>
              <td class="px-4 py-3 text-slate-500 capitalize text-xs">${t(methodLabel(e.method || 'cash', 'en'), methodLabel(e.method || 'cash', 'ar'))}</td>
              <td class="px-4 py-3 text-right font-mono font-bold text-slate-800">${parseFloat(e.amount).toFixed(2)}</td>
              <td class="px-4 py-3 text-center">
                  ${e.source === 'manual'
          ? `<button class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-100 mx-auto opacity-0 group-hover:opacity-100 focus:opacity-100" onclick="deleteExpense('${e._id || e.id}')"><span class="material-symbols-outlined text-[16px]">delete</span></button>`
          : '<span class="text-xs text-slate-400 italic">Auto</span>'}
              </td>
          `;
      tbody.appendChild(tr);
      total += parseFloat(e.amount);
    });

    document.getElementById('total-expenses').textContent = total.toFixed(2);
  }

  function methodLabel(method, language) {
    const labels = {
      en: { cash: "Cash", card: "Card", mobile: "Mobile" },
      ar: { cash: "نقدي", card: "بطاقة", mobile: "موبايل" }
    };
    return labels[language]?.[method] || method;
  }

  window.deleteExpense = async function (id) {
    if (confirm(t("Delete this expense?", "هل تريد حذف هذا المصروف؟"))) {
      try {
        await window.apiFetch(`/expenses/${id}`, { method: 'DELETE' });
        loadExpenses();
      } catch (err) {
        alert(t("Failed to delete", "فشل الحذف"));
      }
    }
  };

  window.filterExpenses = loadExpenses;

  window.resetFilter = function () {
    const d = new Date();
    document.getElementById('filterDate').valueAsDate = d;
    document.getElementById('filterSeller').value = '';
    loadExpenses();
  };

  // === Migration Logic ===
  async function checkAndMigrateExpenses() {
    let hasLocal = false;
    for (let key in localStorage) {
      if (key.startsWith('expense_')) { hasLocal = true; break; }
    }

    if (hasLocal) {
      console.log("Found local expenses to migrate...");
      // Non-blocking migration
      migrateLocalExpenses().then(() => {
        console.log("Migration finished.");
        loadExpenses(); // Reload to show migrated
      });
    }
  }

  async function migrateLocalExpenses() {
    const expensesToMigrate = [];
    const keysToDelete = [];

    for (let key in localStorage) {
      if (key.startsWith('expense_')) {
        try {
          const e = JSON.parse(localStorage.getItem(key));
          if (e) {
            expensesToMigrate.push(e);
            keysToDelete.push(key);
          }
        } catch (err) { console.warn("Bad expense record", key); }
      }
    }

    if (expensesToMigrate.length === 0) return;

    // Upload one by one to ensure valid structure
    // Could be optimized to bulk insert if API supported it
    let successCount = 0;
    for (const e of expensesToMigrate) {
      try {
        const payload = {
          date: e.date,
          seller: e.seller,
          description: e.description,
          amount: e.amount,
          method: e.method || 'cash',
          category: 'General',
          notes: 'Migrated from LocalStorage'
        };

        await window.apiFetch('/expenses', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' }
        });

        successCount++;
      } catch (err) {
        console.error("Migration failed for item", e, err);
      }
    }

    if (successCount > 0) {
      console.log(`Successfully migrated ${successCount} expenses.`);
      // Clean up local
      keysToDelete.forEach(k => localStorage.removeItem(k));
      alert(`Migrated ${successCount} offline expenses to the cloud successfully!`);
    }
  }

});
