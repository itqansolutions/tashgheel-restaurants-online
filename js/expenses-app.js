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

  loadSellers();
  loadExpenses(); // Unified loading function

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

  // === Add Expense ===
  window.addExpense = function () {
    const date = expenseDateInput.value;
    const seller = sellerSelect.value;
    const desc = document.getElementById('expenseDesc').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const method = document.getElementById('expenseMethod').value;

    if (!date || !seller || !desc || isNaN(amount) || amount <= 0) {
      alert(t("Please fill all fields correctly", "يرجى ملء جميع الحقول بشكل صحيح"));
      return;
    }

    const id = generateExpenseId();
    const expense = { id, date, seller, description: desc, amount, method, type: 'expense' };

    localStorage.setItem('expense_' + id, JSON.stringify(expense));
    loadExpenses();
    clearForm();
  };

  function generateExpenseId() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let counter = 1;
    while (localStorage.getItem('expense_' + today + '_' + String(counter).padStart(4, '0'))) {
      counter++;
    }
    return today + '_' + String(counter).padStart(4, '0');
  }

  function clearForm() {
    document.getElementById('expenseDesc').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseMethod').value = 'cash';
  }

  // === Render Logic (Combined) ===
  function loadExpenses() {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // 1. Manual Expenses
    const manualExpenses = [];
    for (let key in localStorage) {
      if (key.startsWith('expense_')) {
        try {
          const e = JSON.parse(localStorage.getItem(key));
          manualExpenses.push({ ...e, source: 'manual' });
        } catch { }
      }
    }

    // 2. Vendor Payments (from DB)
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
        method: 'cash', // Default or need to track
        type: 'vendor_payment',
        source: 'auto'
      };
    });

    // Combined
    let allExpenses = [...manualExpenses, ...paymentExpenses];

    // Filter
    const selectedDate = document.getElementById('filterDate').value;
    const selectedSeller = filterSeller.value;

    allExpenses = allExpenses.filter(e => {
      const matchDate = selectedDate ? e.date === selectedDate : true;
      const matchSeller = selectedSeller ? e.seller === selectedSeller : true;
      return matchDate && matchSeller;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allExpenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${t('No expenses found', 'لا توجد مصاريف')}</td></tr>`;
      document.getElementById('total-expenses').textContent = '0.00';
      return;
    }

    let total = 0;
    allExpenses.forEach((e, idx) => {
      const badge = e.type === 'vendor_payment'
        ? `<span style="background:#3498db;color:white;padding:2px 6px;border-radius:3px;font-size:0.8em;">${t('Vendor', 'مورد')}</span>`
        : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
                <td>${idx + 1}</td>
                <td>${e.date}</td>
                <td>${e.seller || '-'}</td>
                <td>${e.description} ${badge}</td>
                <td>${t(methodLabel(e.method, 'en'), methodLabel(e.method, 'ar'))}</td>
                <td>${parseFloat(e.amount).toFixed(2)}</td>
                <td>
                    ${e.source === 'manual'
          ? `<button class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">🗑️</button>`
          : '<span style="color:#999;">Auto</span>'}
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

  window.deleteExpense = function (id) {
    if (confirm(t("Delete this expense?", "هل تريد حذف هذا المصروف؟"))) {
      localStorage.removeItem('expense_' + id);
      loadExpenses();
    }
  };

  window.filterExpenses = loadExpenses;

  window.resetFilter = function () {
    document.getElementById('filterDate').valueAsDate = new Date();
    document.getElementById('filterSeller').value = '';
    loadExpenses();
  };
});
