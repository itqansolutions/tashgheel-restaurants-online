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

    // Get all sales
    const sales = window.DB ? window.DB.getSales() : [];

    // Filters
    const statusFilter = document.getElementById('statusFilter')?.value;
    const searchTerm = document.getElementById('receiptSearch')?.value.toLowerCase() || '';

    // Filter
    const filtered = sales.filter(s => {
        if (statusFilter && s.status !== statusFilter) return false;
        const searchText = `${s.id} ${s.cashier} ${s.salesman || ''}`.toLowerCase();
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
        row.innerHTML = `
            <td>${sale.id}</td>
            <td>${new Date(sale.date).toLocaleString()}</td>
            <td>${sale.cashier}</td>
            <td>${t(sale.method)}</td>
            <td>${sale.total.toFixed(2)}</td>
            <td><span class="badge badge-success">${t(sale.status)}</span></td>
            <td>-</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="window.printStoredReceipt('${sale.id}')">👁️ ${t('View', 'عرض')}</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

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
window.printStoredReceipt = function (receiptId) {
    const sales = window.DB ? window.DB.getSales() : [];
    const receipt = sales.find(s => s.id === receiptId);

    if (!receipt) {
        alert(t('receipt_not_found') + ": " + receiptId);
        return;
    }

    const shopName = localStorage.getItem('shopName') || 'Tashgheel Restaurant';
    const shopAddress = localStorage.getItem('shopAddress') || '';
    const shopFooter = localStorage.getItem('footerMessage') || 'Thank you for your visit!';
    const shopLogo = localStorage.getItem('shopLogo') || '';

    const lang = localStorage.getItem('pos_language') || 'en';
    const isArabic = lang === 'ar';
    const dir = isArabic ? 'rtl' : 'ltr';

    let totalDiscount = 0;
    let subtotal = 0;

    const itemsHtml = receipt.items.map(item => {
        // item.price is usually the unit price. 
        // We need to calculate if discount was applied or if it's already net.
        // POS-APP processSale: item.price is FINAL unit price (after addons).
        // item.discount is stored. 
        // But calculateTotal uses item.price... 
        // Let's rely on stored totals for simplicity if possible, but receipt needs line items.
        // Let's derive from current values.

        let unitPrice = item.price;
        let discountAmount = 0;

        // If discount type is percent, then item.price IS the base price? 
        // pos-app.js calculateTotal applies discount TO price. So item.price is PRE-discount.
        // Yes: calculateTotal -> let finalPrice = i.price; if percent finalPrice *= ...

        const lineTotalRaw = item.price * item.qty;

        if (item.discount?.type === "percent") {
            discountAmount = lineTotalRaw * (item.discount.value / 100);
        } else if (item.discount?.type === "value") {
            discountAmount = item.discount.value; // Total discount value for line or per unit?
            // pos-app.js: finalPrice -= item.discount.value. This means PER UNIT.
            discountAmount = item.discount.value * item.qty;
        }

        const lineTotalNet = lineTotalRaw - discountAmount;

        subtotal += lineTotalRaw;
        totalDiscount += discountAmount;

        return `
            <tr style="border-bottom: 1px dashed #ddd;">
                <td style="padding: 5px; text-align: ${isArabic ? 'right' : 'left'};">
                    ${item.name} <br>
                    <small style="color:#777;">${item.qty} x ${item.price.toFixed(2)}</small>
                </td>
                <td style="padding: 5px; text-align: ${isArabic ? 'left' : 'right'};">
                    ${lineTotalNet.toFixed(2)}
                </td>
            </tr>
        `;
    }).join('');

    const receiptHTML = `
        <div id="receiptModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center;">
            <div style="background:white; padding:20px; width:300px; max-height:90vh; overflow-y:auto; font-family: 'Courier New', monospace; direction: ${dir}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                
                <div style="text-align:center; margin-bottom:10px;">
                    ${shopLogo ? `<img src="${shopLogo}" style="max-height:60px; margin-bottom:5px;">` : ''}
                    <h3 style="margin:5px 0;">${shopName}</h3>
                    <p style="margin:0; font-size:12px;">${shopAddress}</p>
                    <p style="margin:5px 0; font-size:12px;">${new Date(receipt.date).toLocaleString()}</p>
                    <p style="margin:0; font-size:12px;">#${receipt.id}</p>
                </div>

                <hr style="border-top: 1px dashed #000;">

                <table style="width:100%; font-size:14px; border-collapse: collapse;">
                    ${itemsHtml}
                </table>

                <hr style="border-top: 1px dashed #000;">

                <div style="display:flex; justify-content:space-between; font-size:14px;">
                    <span>${t('subtotal', 'المجموع')}</span>
                    <span>${subtotal.toFixed(2)}</span>
                </div>
                ${totalDiscount > 0 ? `
                <div style="display:flex; justify-content:space-between; font-size:14px; color:red;">
                    <span>${t('discount', 'الخصم')}</span>
                    <span>-${totalDiscount.toFixed(2)}</span>
                </div>
                ` : ''}
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px; margin-top:5px;">
                    <span>${t('total', 'الإجمالي')}</span>
                    <span>${receipt.total.toFixed(2)}</span>
                </div>

                <hr style="border-top: 1px dashed #000;">

                <div style="text-align:center; font-size:12px; margin-top:10px;">
                    <p>${shopFooter}</p>
                    <p>${t('cashier', 'الكاشير')}: ${receipt.cashier}</p>
                </div>

                <div style="margin-top:20px; text-align:center;" class="no-print">
                    <button onclick="window.print()" class="btn btn-primary btn-sm">🖨️ ${t('print', 'طباعة')}</button>
                    <button onclick="document.getElementById('receiptModal').remove()" class="btn btn-secondary btn-sm">❌ ${t('close', 'إغلاق')}</button>
                </div>

                <style>
                    @media print {
                        .no-print { display: none; }
                        body * { visibility: hidden; }
                        #receiptModal, #receiptModal * { visibility: visible; }
                        #receiptModal { position: absolute; left: 0; top: 0; width: 100%; height: auto; background: none; }
                        #receiptModal > div { box-shadow: none; width: 100%; max-width: 100%; }
                    }
                </style>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', receiptHTML);
};
