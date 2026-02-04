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

  // Update active state of lang buttons (handled by translations.js but we can ensure)
  const lang = localStorage.getItem('pos_language') || 'en';

  const fromDateInput = document.getElementById('from-date');
  const toDateInput = document.getElementById('to-date');

  // Re-render when language changes
  window.addEventListener('languageChanged', () => {
    refreshReports();
  });

  document.querySelectorAll('.report-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.report-tab').forEach(btn => btn.classList.remove('active'));
      tab.classList.add('active');
      const selected = tab.dataset.tab;
      document.querySelectorAll('.report-card').forEach(card => card.style.display = 'none');
      document.getElementById('card-' + selected).style.display = 'block';
      runReport(selected);
    });
  });

  document.getElementById('from-date').addEventListener('change', refreshReports);
  document.getElementById('to-date').addEventListener('change', refreshReports);

  function refreshReports() {
    const activeTab = document.querySelector('.report-tab.active')?.dataset.tab || 'sales';
    runReport(activeTab);
  }

  function runReport(type) {
    const fromDate = fromDateInput.value ? new Date(fromDateInput.value) : null;
    const toDate = toDateInput.value ? new Date(toDateInput.value) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    const receipts = getAllReceipts().filter(r => {
      const d = new Date(r.date);
      return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });

    const products = window.DB.getParts();
    const productMap = {};
    products.forEach(p => productMap[String(p.id)] = p);
    products.forEach(p => productMap[String(p.partNumber)] = p);

    const finished = receipts.filter(r => r.status === 'finished');
    const returns = receipts.filter(r => r.status === 'full_return' || r.status === 'partial_return');
    if (type === 'stock-value') {
      generateStockValueReport();
    }
    if (type === 'sales') {
      let totalServices = 0, totalParts = 0, totalDiscount = 0;
      let cashTotal = 0, cardTotal = 0, mobileTotal = 0;

      const calcTotals = (arr, sign = 1) => {
        arr.forEach(r => {
          let rDiscount = 0;
          let rTotal = 0;

          r.items.forEach(i => {
            const d = i.discount?.type === 'percent'
              ? i.price * i.discount.value / 100 * i.qty
              : (i.discount?.value || 0) * i.qty;
            rDiscount += d;

            const netPrice = (i.price * i.qty); // Gross sales
            if (i.code && i.code.startsWith('SVC-')) {
              totalServices += sign * netPrice;
            } else {
              totalParts += sign * netPrice;
            }
            rTotal += netPrice;
          });

          totalDiscount += sign * rDiscount;
          const finalTotal = sign * (rTotal - rDiscount); // Net for this receipt

          // Payment Method Breakdown
          const method = (r.method || 'cash').toLowerCase();
          if (method === 'card' || method === 'visa') {
            cardTotal += finalTotal;
          } else if (method === 'mobile') {
            mobileTotal += finalTotal;
          } else {
            cashTotal += finalTotal;
          }
        });
      };

      calcTotals(finished, 1);

      document.getElementById('total-sales-cash').innerHTML = `
        <div style="margin-bottom:10px;">
           <div><strong>🔧 ${t("Services Total", "إجمالي الخدمات")}:</strong> ${safe(totalServices).toFixed(2)} ${t('EGP', 'ج.م')}</div>
           <div><strong>📦 ${t("Spare Parts Total", "إجمالي قطع الغيار")}:</strong> ${safe(totalParts).toFixed(2)} ${t('EGP', 'ج.م')}</div>
        </div>
        <hr style="margin:5px 0; border:0; border-top:1px dashed #ccc;">
        <div><strong>💵 ${t("Cash", "نقدي")}:</strong> ${safe(cashTotal).toFixed(2)} ${t('EGP', 'ج.م')}</div>
      `;

      document.getElementById('total-sales-card').textContent = safe(cardTotal).toFixed(2) + ' ' + t('EGP', 'ج.م');
      document.getElementById('total-sales-mobile').textContent = safe(mobileTotal).toFixed(2) + ' ' + t('EGP', 'ج.م');

      // Ensure elements are visible
      document.getElementById('total-sales-card').parentNode.style.display = 'block';
      document.getElementById('total-sales-mobile').parentNode.style.display = 'block';

      document.getElementById('total-discounts').textContent = safe(totalDiscount).toFixed(2) + ' ' + t('EGP', 'ج.م');
    }

    if (type === 'cogs') {
      let totalCost = 0;
      finished.forEach(r => {
        r.items.forEach(i => {
          if (!i.code || !i.code.startsWith('SVC-')) {
            const cost = i.cost || 0;
            totalCost += i.qty * cost;
          }
        });
      });
      returns.forEach(r => {
        r.items.forEach(i => {
          if (!i.code || !i.code.startsWith('SVC-')) {
            const cost = i.cost || 0;
            totalCost -= i.qty * cost;
          }
        });
      });
      document.getElementById('total-cogs').textContent = safe(totalCost).toFixed(2) + ' ' + t('EGP', 'ج.م');
    }

    if (type === 'profit') {
      let partsRevenue = 0;
      let partsCost = 0;
      let servicesRevenue = 0;

      const calcProfit = (arr, sign = 1) => {
        arr.forEach(r => {
          r.items.forEach(i => {
            const discount = i.discount?.type === 'percent' ? (i.price * i.discount.value / 100) : i.discount?.value || 0;
            const netPrice = i.price - discount;
            const totalNet = netPrice * i.qty;

            if (i.code && i.code.startsWith('SVC-')) {
              servicesRevenue += sign * totalNet;
            } else {
              partsRevenue += sign * totalNet;
              const cost = i.cost || 0;
              partsCost += sign * (cost * i.qty);
            }
          });
        });
      };

      calcProfit(finished, 1);
      calcProfit(returns, -1);

      const profit = (partsRevenue - partsCost) + servicesRevenue;
      document.getElementById('total-profit').textContent = profit.toFixed(2) + ' ' + t('EGP', 'ج.م');
    }

    if (type === 'visits') {
      const visits = window.DB.getVisits();
      const relevantVisits = visits.filter(v => {
        const d = new Date(v.completedAt || v.createdAt);
        if (v.status !== 'Completed') return false;
        return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
      });

      const count = relevantVisits.length;
      const totalRevenue = relevantVisits.reduce((sum, v) => sum + (v.finalTotal || 0), 0);

      const activeVisits = visits.filter(v => v.status !== 'Completed').length;

      document.getElementById('visits-count').textContent = count;
      document.getElementById('visits-price').textContent = totalRevenue.toFixed(2) + ' ' + t('EGP', 'ج.م');

      // Add info about active visits if any
      if (activeVisits > 0) {
        const info = document.createElement('div');
        info.style.color = '#e67e22';
        info.style.marginTop = '10px';
        info.innerHTML = `<strong>⚠️ ${activeVisits} ${t('Active/Draft Visits', 'زيارات نشطة/مسودة')}</strong> (${t('not included in reports', 'غير مدرجة في التقارير')})`;
        document.getElementById('visits-price').parentNode.parentNode.appendChild(info);
      }

      const map = relevantVisits.map(v => ({
        date: new Date(v.completedAt || v.createdAt).toLocaleDateString(),
        customer: v.customerName,
        technician: v.technician || '-',
        total: v.finalTotal || 0
      }));

      renderTable('table-visits', map, ['date', 'customer', 'technician', 'total'], [
        t("Date", "التاريخ"),
        t("Customer", "العميل"),
        t("Technician", "الفني"),
        t("Total", "الإجمالي")
      ]);
    }

    if (type === 'expenses') {
      generateExpensesReport(fromDate, toDate);
    }

    if (type === 'returns') {
      const total = returns.reduce((sum, r) => {
        let d = 0;
        r.items.forEach(i => {
          const discount = i.discount?.type === 'percent' ? i.price * i.discount.value / 100 : i.discount?.value || 0;
          const net = i.price - discount;
          d += i.qty * net;
        });
        return sum + d;
      }, 0);
      document.getElementById('total-returns').textContent = safe(total).toFixed(2) + ' ' + t('EGP', 'ج.م');
    }

    if (type === 'by-product') {
      const map = {};
      receipts.forEach(r => {
        r.items.forEach(i => {
          const code = String(i.code);
          if (!map[code]) {
            const product = productMap[code];
            map[code] = {
              code,
              name: product?.name || i.name || t("Unknown", "غير معروف"),
              category: product?.category || t("Uncategorized", "بدون تصنيف"),
              stock: product?.stock || 0,
              qty: 0,
              totalBefore: 0,
              discount: 0,
              totalAfter: 0
            };
          }

          const discountValue = i.discount?.type === 'percent'
            ? i.price * i.discount.value / 100
            : i.discount?.value || 0;

          const net = i.price - discountValue;

          map[code].qty += i.qty;
          map[code].totalBefore += i.qty * i.price;
          map[code].discount += discountValue * i.qty;
          map[code].totalAfter += i.qty * net;
        });
      });

      renderTable('table-by-product', map,
        ['code', 'name', 'stock', 'qty', 'totalBefore', 'discount', 'totalAfter'],
        [
          t("Code", "الكود"),
          t("Name", "الاسم"),
          t("Stock Quantity", "الكمية بالمخزون"),
          t("Sold Quantity", "الكمية المباعة"),
          t("Total Before Discount", "الإجمالي قبل الخصم"),
          t("Discount", "الخصم"),
          t("Net Sales", "الصافي بعد الخصم")
        ]);
    }


    if (type === 'by-category') {
      const categoryMap = {};
      receipts.forEach(r => {
        r.items.forEach(i => {
          const code = String(i.code);
          const category = productMap[code]?.category || t("Uncategorized", "بدون تصنيف");
          if (!categoryMap[category]) categoryMap[category] = { category, qty: 0, total: 0 };
          const discount = i.discount?.type === 'percent'
            ? i.price * i.discount.value / 100
            : i.discount?.value || 0;
          const net = i.price - discount;
          categoryMap[category].qty += i.qty;
          categoryMap[category].total += i.qty * net;
        });
      });
      renderTable('table-by-category', categoryMap, ['category', 'qty', 'total'], [
        t("Category", "التصنيف"),
        t("Saled Quantity", "الكمية المباعة"),
        t("Total Sales", "إجمالي المبيعات")
      ]);
    }

    if (type === 'by-user') {
      const map = {};
      receipts.forEach(r => {
        const cashier = r.cashier || t("Unknown", "غير معروف");
        if (!map[cashier]) map[cashier] = { cashier, total: 0, discount: 0, net: 0 };

        r.items.forEach(i => {
          const discount = i.discount?.type === 'percent'
            ? i.price * i.discount.value / 100 * i.qty
            : i.discount?.value * i.qty || 0;

          const total = i.qty * i.price;
          map[cashier].total += total;
          map[cashier].discount += discount;
          map[cashier].net += (total - discount);
        });
      });

      renderTable('table-by-user', map, ['cashier', 'total', 'discount', 'net'], [
        t("Cashier", "الكاشير"),
        t("Total Sales", "إجمالي المبيعات"),
        t("Total Discount", "إجمالي الخصومات"),
        t("Net Sales", "صافي المبيعات")
      ]);
    }
  }
  function generateStockValueReport() {
    const products = window.DB.getParts();
    const table = document.getElementById('table-stock-value');
    table.innerHTML = '';

    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th>${t('Category', 'التصنيف')}</th>
      <th>${t('Total Stock Cost', 'إجمالي تكلفة المخزون')} (${t('EGP', 'ج.م')})</th>
    `;
    table.appendChild(headerRow);

    const categoryMap = {};
    let grandTotal = 0;

    products.forEach(p => {
      const category = p.category || t('Uncategorized', 'غير مصنف');
      const cost = parseFloat(p.cost || 0);
      const stock = parseFloat(p.stock || 0);
      const total = cost * stock;
      if (!categoryMap[category]) categoryMap[category] = 0;
      categoryMap[category] += total;
      grandTotal += total;
    });

    for (const category in categoryMap) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${category}</td>
        <td>${categoryMap[category].toFixed(2)}</td>
      `;
      table.appendChild(row);
    }

    const finalRow = document.createElement('tr');
    finalRow.innerHTML = `
      <td><strong>${t('Total', 'الإجمالي')}</strong></td>
      <td><strong>${grandTotal.toFixed(2)}</strong></td>
    `;
    table.appendChild(finalRow);
  }
  function renderTable(tableId, dataMap, fields, headers) {
    const table = document.getElementById(tableId);
    table.innerHTML = '';
    const thead = table.insertRow();
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });

    Object.values(dataMap).forEach(row => {
      const tr = table.insertRow();
      fields.forEach(field => {
        const td = tr.insertCell();
        td.textContent = (row[field] || 0).toFixed ? row[field].toFixed(2) : row[field];
      });
    });
  }

  function generateExpensesReport(fromDate, toDate) {
    const allExpenses = [];
    const table = document.getElementById('table-expenses');
    table.innerHTML = '';

    // Get manual expenses
    for (let key in localStorage) {
      if (key.startsWith('expense_')) {
        try {
          const e = JSON.parse(localStorage.getItem(key));
          allExpenses.push({ ...e, type: 'Expense', category: 'General' });
        } catch { }
      }
    }

    // Get vendor payments
    const payments = window.DB.getVendorPayments();
    payments.forEach(p => {
      const vendor = window.DB.getVendor(p.vendorId);
      allExpenses.push({
        date: p.date,
        category: 'Vendor Payment',
        description: `Payment to ${vendor?.name || 'Unknown'}`,
        amount: p.amount,
        type: 'Payment'
      });
    });

    // Filter by date
    const filtered = allExpenses.filter(e => {
      const d = new Date(e.date);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate Total
    const total = filtered.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    document.getElementById('total-expenses-amount').textContent = total.toFixed(2) + ' ' + t('EGP', 'ج.م');

    // Render
    const headers = [t('Date', 'التاريخ'), t('Type', 'النوع'), t('Category', 'التصنيف'), t('Description', 'الوصف'), t('Amount', 'المبلغ')];
    const thead = table.insertRow();
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });

    filtered.forEach(e => {
      const tr = table.insertRow();
      tr.innerHTML = `
            <td>${e.date}</td>
            <td>${e.type}</td>
            <td>${e.category || '-'}</td>
            <td>${e.description || '-'}</td>
            <td>${parseFloat(e.amount).toFixed(2)}</td>
          `;
    });
  }

  function getAllReceipts() {
    return window.DB ? window.DB.getSales() : [];
  }

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  if (currentUser.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(e => e.style.display = 'block');
  }

  runReport('sales');
});
