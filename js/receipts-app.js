// Simple receipts page for service visits only
document.addEventListener('DOMContentLoaded', () => {
    loadServiceReceipts();

    // Search functionality
    const searchInput = document.getElementById('receiptSearch');
    if (searchInput) {
        searchInput.addEventListener('input', loadServiceReceipts);
    }

    // Re-render when language changes
    window.addEventListener('languageChanged', () => {
        loadServiceReceipts();
    });
});

// Hybrid Translation Helper
const t = (keyOrEn, ar) => {
    const lang = localStorage.getItem('pos_language') || 'en';
    if (ar) return lang === 'ar' ? ar : keyOrEn;
    if (window.translations && window.translations[keyOrEn]) {
        return window.translations[keyOrEn][lang];
    }
    return keyOrEn;
};

async function loadServiceReceipts() {
    // EnhancedSecurity.init() is now auto-handled by auth.js
    const tbody = document.getElementById('receiptsTableBody');
    if (!tbody) return;

    // Show loading state
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px;">Loading receipts...</td></tr>`;

    // Get all sales from API
    let sales = [];
    try {
        if (window.electronAPI && window.electronAPI.getSalesHistory) {
            // Fetch last 100 sales (or implement pagination later)
            const result = await window.electronAPI.getSalesHistory({ limit: 100 });
            sales = result.sales || result || [];
        } else if (window.apiFetch) {
            // 🚀 Web Mode Support
            const result = await window.apiFetch('/reports/history?limit=100');
            sales = result.sales || result || [];
        } else {
            // Fallback to local DB (Legacy/Offline)
            sales = window.DB ? window.DB.getSales() : [];
        }
    } catch (e) {
        console.error("Failed to load receipts:", e);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">Error loading receipts.</td></tr>`;
        return;
    }

    // Filters
    const statusFilter = document.getElementById('statusFilter')?.value;
    const searchTerm = document.getElementById('receiptSearch')?.value.toLowerCase() || '';

    // Filter
    const filtered = sales.filter(s => {
        if (statusFilter && s.status !== statusFilter) return false;
        // Search by ID (last 8 chars), cashier (if name exists), or salesman
        // Note: s.id is a full MongoID now, slice(-8) is still good for display
        const searchText = `${s.id} ${s.cashier || ''} ${s.salesman || ''} ${s.customer?.name || ''}`.toLowerCase();
        return searchText.includes(searchTerm);
    });

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Render
    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center">${t('No receipts found', 'لا توجد فواتير')}</td></tr>`;
        return;
    }

    filtered.forEach(sale => {
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition-colors group border-b border-slate-50 last:border-0";

        const statusColors = {
            'finished': 'bg-green-50 text-green-700 border-green-100',
            'cancelled': 'bg-red-50 text-red-700 border-red-100',
            'partial_return': 'bg-amber-50 text-amber-700 border-amber-100',
            'full_return': 'bg-orange-50 text-orange-700 border-orange-100'
        };
        const statusClass = statusColors[sale.status] || 'bg-slate-100 text-slate-600 border-slate-200';

        // Handle potentially missing fields safely
        const displayId = (sale._id || sale.id || '').toString().slice(-6).toUpperCase();
        const displayDate = sale.date ? new Date(sale.date).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

        row.innerHTML = `
            <td class="px-6 py-4 text-sm font-mono text-slate-500">#${displayId}</td>
            <td class="px-6 py-4 text-sm text-slate-700">
                ${displayDate}
            </td>
            <td class="px-6 py-4 text-sm font-medium text-slate-800">${sale.cashier || '-'}</td>
            <td class="px-6 py-4 text-sm text-slate-600 capitalize">${t(sale.method || 'cash')}</td>
            <td class="px-6 py-4 text-right text-sm font-bold text-slate-900">${(sale.total || 0).toFixed(2)}</td>
            <td class="px-6 py-4 text-center">
                <span class="px-2 py-1 rounded text-xs font-bold border ${statusClass}">${t(sale.status || 'finished')}</span>
            </td>
            <td class="px-6 py-4 text-center flex items-center justify-center gap-2">
                <button onclick="printStoredReceipt('${sale._id || sale.id}')" 
                    class="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="${t('Print', 'طباعة')}">
                    <span class="material-symbols-outlined text-[20px]">print</span>
                </button>
                ${(sale.status === 'finished') ? `
                <button onclick="handleRefund('${sale._id || sale.id}')" 
                    class="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="${t('Refund', 'استرجاع')}">
                    <span class="material-symbols-outlined text-[20px]">undo</span>
                </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 🟢 NEW: Enterprise Refund Logic
window.handleRefund = async function (saleId) {
    // Permission Check (Optional: Backend enforces it, but UI hide is good)
    // const user = JSON.parse(localStorage.getItem('user') || '{}');
    // if (user.role !== 'admin' && user.role !== 'manager') { ... }

    const reason = prompt(t('Enter refund reason:', 'أدخل سبب الاسترجاع:'));
    if (!reason) return; // Cancelled

    if (!confirm(t('Are you sure you want to refund this order? Stock will be restored.', 'هل أنت متأكد من استرجاع هذا الطلب؟ سيتم إعادة المخزون.'))) {
        return;
    }

    try {
        const response = await window.apiFetch(`/sales/refund/${saleId}`, {
            method: 'POST',
            body: JSON.stringify({ reason })
        });

        if (response.success) {
            alert(t('Refund Successful', 'تم الاسترجاع بنجاح'));
            loadServiceReceipts(); // Refresh table
        } else {
            alert(t('Refund Failed', 'فشل الاسترجاع') + ': ' + (response.error || 'Unknown'));
        }
    } catch (e) {
        console.error('Refund Request Error:', e);
        alert(t('Refund Failed', 'فشل الاسترجاع'));
    }
};

function viewServiceInvoice(visitId) {
    const visit = window.DB.getVisit(visitId);
    if (!visit) {
        alert(t('receipt_not_found'));
        return;
    }

    const customer = window.DB.getCustomers().find(c => c.id === visit.customerId);
    const vehicle = window.DB.getVehicles().find(v => v.id === visit.vehicleId);

    // Get shop settings
    const shopName = localStorage.getItem('shopName') || 'Car Service Center';
    const shopAddress = localStorage.getItem('shopAddress') || '';
    const footerMessage = localStorage.getItem('footerMessage') || 'Thank you for your business!';
    const shopLogo = localStorage.getItem('shopLogo') || '';

    // Get language
    const lang = localStorage.getItem('pos_language') || 'en';
    const isArabic = lang === 'ar';
    const direction = isArabic ? 'rtl' : 'ltr';

    const invoiceHTML = `
        <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; overflow-y:auto; padding:20px;" id="invoiceModal">
            <div style="background:white; padding:30px; max-width:700px; margin:20px auto; border:2px solid #333; border-radius:8px; direction:${direction}; font-family: Arial, sans-serif;">
                
                <!-- Header -->
                <div style="text-align:center; margin-bottom:20px; border-bottom:3px solid #333; padding-bottom:15px;">
                    ${shopLogo ? `<img src="${shopLogo}" alt="Logo" style="max-height:80px; margin-bottom:10px;">` : ''}
                    <h1 style="margin:5px 0; font-size:1.8em; color:#2c3e50;">${shopName}</h1>
                    ${shopAddress ? `<p style="margin:5px 0; color:#7f8c8d;">${shopAddress}</p>` : ''}
                </div>
                
                <h2 style="text-align:center; margin:0 0 20px 0; color:#e74c3c;">🧾 ${t('INVOICE', 'فاتورة')} #${visit.id}</h2>
                
                <!-- Customer Info -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px; padding:15px; background:#f8f9fa; border-radius:6px;">
                    <div>
                        <p style="margin:5px 0;"><strong>${t('Customer:', 'العميل:')}</strong> ${customer?.name || 'N/A'}</p>
                        <p style="margin:5px 0;"><strong>${t('Mobile:', 'الموبايل:')}</strong> ${customer?.mobile || 'N/A'}</p>
                        <p style="margin:5px 0;"><strong>${t('Date:', 'التاريخ:')}</strong> ${new Date(visit.completedAt).toLocaleString()}</p>
                    </div>
                    <div>
                        <p style="margin:5px 0;"><strong>${t('Vehicle:', 'المركبة:')}</strong> ${vehicle?.brand} ${vehicle?.model}</p>
                        <p style="margin:5px 0;"><strong>${t('Plate:', 'اللوحة:')}</strong> ${vehicle?.plateNumber}</p>
                        <p style="margin:5px 0;"><strong>${t('Technician:', 'الفني:')}</strong> ${visit.technician || 'N/A'}</p>
                    </div>
                </div>
                
                <!-- Services -->
                ${visit.services.length > 0 ? `
                <div style="margin-bottom:20px;">
                    <h3 style="background:#3498db; color:white; padding:10px; margin:0 0 10px 0; border-radius:6px;">🔧 ${t('Services', 'الخدمات')}</h3>
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:#34495e; color:white;">
                                <th style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'right' : 'left'};">#</th>
                                <th style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'right' : 'left'};">${t('Service', 'الخدمة')}</th>
                                <th style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${t('Price', 'السعر')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${visit.services.map((s, i) => `
                                <tr>
                                    <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'right' : 'left'};">${i + 1}</td>
                                    <td style="border:1px solid #ddd; padding:8px;">${s.name}</td>
                                    <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${s.cost.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                            <tr style="background:#ecf0f1; font-weight:bold;">
                                <td colspan="2" style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${t('Total Services:', 'إجمالي الخدمات:')}</td>
                                <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'}; color:#3498db;">${visit.services.reduce((sum, s) => sum + parseFloat(s.cost), 0).toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                ` : ''}
                
                <!-- Parts -->
                ${visit.parts.length > 0 ? `
                <div style="margin-bottom:20px;">
                    <h3 style="background:#27ae60; color:white; padding:10px; margin:0 0 10px 0; border-radius:6px;">📦 ${t('Spare Parts', 'قطع الغيار')}</h3>
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:#34495e; color:white;">
                                <th style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'right' : 'left'};">#</th>
                                <th style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'right' : 'left'};">${t('Part', 'القطعة')}</th>
                                <th style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${t('Qty', 'الكمية')}</th>
                                <th style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${t('Price', 'السعر')}</th>
                                <th style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${t('Total', 'الإجمالي')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${visit.parts.map((p, i) => `
                                <tr>
                                    <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'right' : 'left'};">${i + 1}</td>
                                    <td style="border:1px solid #ddd; padding:8px;">${p.name}</td>
                                    <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${p.qty}</td>
                                    <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${p.price.toFixed(2)}</td>
                                    <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${(p.price * p.qty).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                            <tr style="background:#ecf0f1; font-weight:bold;">
                                <td colspan="4" style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'};">${t('Total Parts:', 'إجمالي قطع الغيار:')}</td>
                                <td style="border:1px solid #ddd; padding:8px; text-align:${isArabic ? 'left' : 'right'}; color:#27ae60;">${visit.parts.reduce((sum, p) => sum + (p.price * p.qty), 0).toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                ` : ''}
                
                <!-- Totals -->
                <div style="margin-top:20px; padding:15px; background:#f8f9fa; border-radius:6px;">
                    <table style="width:100%;">
                        <tr>
                            <td style="padding:5px; text-align:${isArabic ? 'left' : 'right'};"><strong>${t('Subtotal:', 'الإجمالي الفرعي:')}</strong></td>
                            <td style="padding:5px; text-align:${isArabic ? 'left' : 'right'}; width:120px;"><strong>${visit.totalCost.toFixed(2)}</strong></td>
                        </tr>
                        ${visit.taxEnabled ? `
                        <tr>
                            <td style="padding:5px; text-align:${isArabic ? 'left' : 'right'};">${t('Tax (14%):', 'الضريبة (١٤٪):')}</td>
                            <td style="padding:5px; text-align:${isArabic ? 'left' : 'right'}; width:120px;">${visit.tax.toFixed(2)}</td>
                        </tr>
                        ` : ''}
                        ${visit.discount > 0 ? `
                        <tr>
                            <td style="padding:5px; text-align:${isArabic ? 'left' : 'right'}; color:#e74c3c;">${t('Discount:', 'الخصم:')}</td>
                            <td style="padding:5px; text-align:${isArabic ? 'left' : 'right'}; width:120px; color:#e74c3c;">-${visit.discount.toFixed(2)}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-top:2px solid #2c3e50;">
                            <td style="padding:10px; text-align:${isArabic ? 'left' : 'right'}; font-size:1.3em; font-weight:bold;">${t('TOTAL:', 'الإجمالي:')}</td>
                            <td style="padding:10px; text-align:${isArabic ? 'left' : 'right'}; font-size:1.3em; font-weight:bold; color:#27ae60; width:120px;">${visit.finalTotal.toFixed(2)}</td>
                        </tr>
                    </table>
                </div>
                
                ${visit.notes ? `
                <div style="margin-top:15px; padding:12px; background:#fff3cd; border-left:4px solid #ffc107; border-radius:6px;">
                    <h4 style="margin:0 0 8px 0; color:#856404;">📝 ${t('Notes:', 'ملاحظات:')}</h4>
                    <p style="margin:0; color:#856404;">${visit.notes}</p>
                </div>
                ` : ''}
                
                ${footerMessage ? `
                <div style="text-align:center; margin-top:20px; padding:12px; background:#ecf0f1; border-radius:6px;">
                    <p style="margin:0; font-style:italic; color:#34495e;">${footerMessage}</p>
                </div>
                ` : ''}
                
                <!-- Company Footer -->
                <div style="margin-top:25px; padding:12px; background:#2c3e50; color:white; border-radius:6px; text-align:center;">
                    <h4 style="margin:0 0 6px 0; font-size:1em;">Tashgheel Services</h4>
                    <p style="margin:0 0 6px 0; font-size:0.8em;">Powered by <strong>itqan solutions</strong></p>
                    <div style="margin-top:6px; padding-top:6px; border-top:1px solid #34495e; font-size:0.75em;">
                        <p style="margin:2px 0;">📧 info@itqansolutions.org | 🌐 itqansolutions.org</p>
                        <p style="margin:2px 0;">📱 +201126522373 / +201155253886</p>
                    </div>
                </div>
                
                <div style="text-align:center; margin-top:20px;">
                    <button onclick="window.print()" class="btn btn-primary" style="padding:10px 20px;">🖨️ ${t('Print', 'طباعة')}</button>
                    <button onclick="document.getElementById('invoiceModal').remove()" class="btn btn-secondary" style="padding:10px 20px; margin-left:10px;">${t('Close', 'إغلاق')}</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', invoiceHTML);
}

// Global logout function
window.logout = function () {
    if (typeof logout === 'function') {
        logout();
    } else {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }
};

// ===================== PRINT RECEIPT MODULE =====================
window.printStoredReceipt = async function (receiptId) {
    let receipt = null;

    // 1. Try fetching single receipt by ID (most reliable)
    if (window.apiFetch) {
        try {
            receipt = await window.apiFetch(`/sales/${receiptId}`);
        } catch (e) { console.warn('Direct sale fetch failed, trying batch:', e.message); }
    }

    // 2. Fallback: search in batch (for electronAPI or if direct fetch failed)
    if (!receipt && window.electronAPI && window.electronAPI.getSalesHistory) {
        try {
            const res = await window.electronAPI.getSalesHistory({ limit: 200 });
            if (res && res.sales) {
                receipt = res.sales.find(s => (s._id == receiptId || s.id == receiptId));
            }
        } catch (e) { console.error(e); }
    }

    // 3. Fallback to Local
    if (!receipt && window.DB) {
        const sales = window.DB.getSales();
        receipt = sales.find(s => s.id === receiptId);
    }

    if (!receipt) {
        alert(t('receipt_not_found') + ": " + receiptId);
        return;
    }

    const shopName = localStorage.getItem('shopName') || 'Tashgheel Restaurant';
    const shopAddress = localStorage.getItem('shopAddress') || '';
    const shopLogo = localStorage.getItem('shopLogo') || '';
    const receiptFooterMessage = localStorage.getItem('footerMessage') || '';

    const lang = localStorage.getItem('pos_language') || 'en';

    const paymentMap = {
        cash: t('cash', 'نقدي'),
        card: t('card', 'بطاقة'),
        mobile: t('mobile', 'محفظة')
    };

    let totalDiscount = 0;
    let subtotal = 0;

    const itemsHtml = (receipt.items || []).map(item => {
        const price = item.price || 0;
        const qty = item.qty || 0;
        const originalTotal = price * qty;

        let discountStr = "-";
        let discountAmountPerUnit = 0;

        if (item.discount?.type === "percent") {
            discountAmountPerUnit = price * (item.discount.value / 100);
            discountStr = `${item.discount.value}%`;
        } else if (item.discount?.type === "value") {
            discountAmountPerUnit = item.discount.value;
            discountStr = `${discountAmountPerUnit.toFixed(2)}`;
        }

        const itemDiscountTotal = discountAmountPerUnit * qty;
        totalDiscount += itemDiscountTotal;
        subtotal += originalTotal;

        const itemName = item.sizeName ? `${item.name} (${item.sizeName})` : (item.name || '-');

        let addonsText = '';
        if (item.addons && item.addons.length > 0) {
            addonsText = `<div style="font-size:10px; color:#555;">+ ${item.addons.map(a => a.name).join(', ')}</div>`;
        }

        return `
          <tr>
            <td>${item.code || '-'}</td>
            <td style="text-align:left;">${itemName}${addonsText}</td>
            <td>${qty}</td>
            <td>${price.toFixed(2)}</td>
            <td>${originalTotal.toFixed(2)}</td>
            <td>${discountStr}</td>
          </tr>
        `;
    }).join('');

    // Tax Breakdown HTML
    let taxesHtml = '';
    if (receipt.appliedTaxes && receipt.appliedTaxes.length > 0) {
        taxesHtml = receipt.appliedTaxes.map(tax =>
            `<p>${tax.name} (${tax.percentage}%): ${tax.amount.toFixed(2)}</p>`
        ).join('');
    } else if (receipt.tax > 0) {
        taxesHtml = `<p>${t('tax', 'ضريبة') || 'Tax'}: ${receipt.tax.toFixed(2)}</p>`;
    }

    // Delivery Fee HTML
    let deliveryHtml = '';
    if (receipt.deliveryFee > 0) {
        deliveryHtml = `<p>${t('delivery_fee', 'التوصيل') || 'Delivery'}: ${receipt.deliveryFee.toFixed(2)}</p>`;
    }

    const dateFormatted = new Date(receipt.date).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    const html = `
    <html>
<head>
  <title>${t('receipt', 'إيصال') || 'Receipt'}</title>
<style>
  body {
    font-family: Arial, sans-serif;
    font-size: 11.5px;
    font-weight: bold;
    line-height: 1.5;
    direction: ${lang === 'ar' ? 'rtl' : 'ltr'};
    margin: 0;
    padding: 0;
  }

  .receipt-container {
    width: 72mm;
    margin: 0;
    padding: 5px 0;
    background: #fff;
    box-sizing: border-box;
  }

  .center {
    text-align: center;
  }

  img.logo {
    max-height: 70px;
    display: block;
    margin: 0 auto 5px;
  }

  h2 {
    margin: 3px 0;
    font-size: 15px;
    font-weight: bold;
  }

  p {
    margin: 2px 8px;
    font-weight: bold;
  }

  table {
    width: 98%;
    border-collapse: collapse;
    margin: 8px auto 4px;
    table-layout: fixed;
  }

  th, td {
    border: 1px dashed #444;
    padding: 4px 5px;
    text-align: center;
    font-size: 11px;
    white-space: normal;
    word-break: break-word;
    font-weight: bold;
  }

  th:nth-child(1), td:nth-child(1) { width: 12%; } /* Code */
  th:nth-child(2), td:nth-child(2) { width: 28%; } /* Name */
  th:nth-child(3), td:nth-child(3) { width: 10%; } /* Qty */
  th:nth-child(4), td:nth-child(4) { width: 16%; } /* Price */
  th:nth-child(5), td:nth-child(5) { width: 16%; } /* Total */
  th:nth-child(6), td:nth-child(6) { width: 18%; } /* Discount */

  .summary {
    margin: 10px 8px 0;
    font-size: 12px;
    font-weight: bold;
    border-top: 1px solid #000;
    padding-top: 5px;
  }

  .footer {
    text-align: center;
    margin: 12px 0 0;
    font-size: 10.5px;
    border-top: 1px dashed #ccc;
    padding-top: 6px;
    font-weight: bold;
  }
</style>
</head>
<body>
  <div class="receipt-container">
    ${shopLogo ? `<img src="${shopLogo}" class="logo">` : ''}
    <h2 class="center">${shopName}</h2>
    <p class="center">${shopAddress}</p>
    <hr/>
    <p>${t('receipt_no', 'رقم الإيصال') || 'Receipt No'}: #${receipt.receiptNo || receipt.invoiceNumber || (receipt._id || receipt.id || '').toString().slice(-6).toUpperCase()}</p>
    <p>${t('cashier', 'الكاشير') || 'Cashier'}: ${receipt.cashier || '-'}</p>
    <p>${t('waiter', 'النادل') || 'Waiter'}: ${receipt.salesman || '-'}</p>
    
    ${receipt.tableId ? `<p><strong>${t('table', 'الطاولة') || 'Table'}: ${receipt.tableName || receipt.tableId}</strong></p>` : ''}
    ${receipt.customer ? `<p><strong>${t('customer', 'العميل') || 'Customer'}: ${receipt.customer.name || ''}</strong></p>` : ''}
    
    <p>${t('date', 'التاريخ') || 'Date'}: ${dateFormatted}</p>
    <p>${t('method', 'طريقة الدفع') || 'Payment Method'}: ${paymentMap[receipt.method] || receipt.method || '-'}</p>

    <table>
  <thead>
    <tr>
      <th>${t('code', 'كود') || 'Code'}</th>
      <th>${t('name', 'الاسم') || 'Name'}</th>
      <th>${t('qty', 'الكمية') || 'Qty'}</th>
      <th>${t('unit_price', 'السعر') || 'Price'}</th>
      <th>${t('total', 'الإجمالي') || 'Total'}</th>
      <th>${t('discount', 'الخصم') || 'Disc'}</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

    <div class="summary">
      <p style="display:flex; justify-content:space-between;"><span>${t('subtotal', 'المجموع')}:</span> <span>${subtotal.toFixed(2)}</span></p>
      ${totalDiscount > 0 ? `<p style="display:flex; justify-content:space-between;"><span>${t('total_discounts', 'إجمالي الخصومات')}:</span> <span>-${totalDiscount.toFixed(2)}</span></p>` : ''}
      
      <!-- Taxes -->
      ${taxesHtml ? `<div style="border-top:1px dashed #ccc; margin:5px 0; padding:2px 0;">${taxesHtml}</div>` : ''}
      
      <!-- Delivery Fee -->
      ${deliveryHtml ? `<div style="border-top:1px dashed #ccc; margin:5px 0; padding:2px 0;">${deliveryHtml}</div>` : ''}
      
      <p style="display:flex; justify-content:space-between; font-size:16px; margin-top:5px; border-top:2px solid #000; padding-top:2px;">
         <span>${t('total', 'الإجمالي')}:</span> 
         <span>${(receipt.total || 0).toFixed(2)}</span>
      </p>
    </div>
    
    <hr/>
    ${receiptFooterMessage ? `<p class="footer" style="font-size:13px; font-weight: bold;">${receiptFooterMessage}</p>` : ''}
    <p class="footer">
      <strong>Tashgheel POS &copy; 2025</strong><br>
    </p>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
    </html>
  `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
};
