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
            'full_return': 'bg-orange-50 text-orange-700 border-orange-100',
            'refunded': 'bg-orange-50 text-orange-700 border-orange-100'
        };
        const statusClass = statusColors[sale.status] || 'bg-slate-100 text-slate-600 border-slate-200';

        // Handle potentially missing fields safely
        const displayId = sale.receiptNo || sale.invoiceNumber || (sale._id || sale.id || '').toString().slice(-6).toUpperCase();
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
                <span class="px-2 py-1 rounded text-xs font-bold border ${statusClass}">${sale.status === 'refunded' ? t('Returns', 'مرتجعات') : t(sale.status || 'finished')}</span>
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

// Refunds require a reason and an explicit, reviewable confirmation.
// Keep the manager gate; never retry an uncertain request automatically.
let refundDialogActive = false;
window.handleRefund = function (saleId) {
    if (refundDialogActive) return;
    refundDialogActive = true;
    window.requireManagerPin(t('Authorize Refund/Void', 'اعتماد الاسترجاع'), () => {
        const previousFocus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.id = 'refundDialog';
        dialog.setAttribute('aria-labelledby', 'refundTitle');
        dialog.style.cssText = 'width:min(92vw,560px);max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:16px;padding:24px;box-shadow:0 20px 60px #0004;color:#0f172a';
        dialog.dir = (localStorage.getItem('pos_language') || 'en') === 'ar' ? 'rtl' : 'ltr';
        dialog.innerHTML = `
          <h2 id="refundTitle" style="font-size:20px;font-weight:700;margin:0 0 12px"></h2>
          <p id="refundIdentity" style="overflow-wrap:anywhere;margin-bottom:12px"></p>
          <p id="refundWarning" style="margin-bottom:16px"></p>
          <form id="refundConfirmForm">
            <fieldset style="margin-bottom:16px;padding:12px;border:1px solid #cbd5e1;border-radius:8px">
              <legend id="refundDispositionLabel"></legend>
              <div id="refundStockChoices"></div>
            </fieldset>
            <label for="refundReason" id="refundReasonLabel" style="display:block;font-weight:600;margin-bottom:8px"></label>
            <textarea id="refundReason" required maxlength="500" rows="3" style="display:block;width:100%;box-sizing:border-box;border:1px solid #94a3b8;border-radius:8px;padding:10px"></textarea>
            <p id="refundResult" role="status" aria-live="polite" style="min-height:24px;margin:12px 0;color:#b91c1c"></p>
            <div style="display:flex;gap:10px;justify-content:flex-end">
              <button type="button" id="refundCancel" style="padding:10px 16px;background:#e2e8f0;border-radius:8px"></button>
              <button type="submit" id="refundSubmit" style="padding:10px 16px;background:#b91c1c;color:white;border-radius:8px"></button>
            </div>
          </form>`;
        dialog.querySelector('#refundTitle').textContent = t('Confirm refund', 'تأكيد الاسترجاع');
        dialog.querySelector('#refundIdentity').textContent = t('Receipt ID: ', 'معرف الفاتورة: ') + saleId;
        dialog.querySelector('#refundWarning').textContent = t('This returns the WHOLE receipt financially. Separately select any intact physical goods and quantity. Prepared ingredients can never be restored.', 'هذا مرتجع مالي للفاتورة بالكامل. اختر البضاعة السليمة وكميتها بشكل منفصل. خامات التحضير لا تعاد أبدا.');
        dialog.querySelector('#refundReasonLabel').textContent = t('Refund reason', 'سبب الاسترجاع');
        dialog.querySelector('#refundDispositionLabel').textContent = t('Return disposition (required)', 'التصرف في المرتجع (مطلوب)');
        const cancel = dialog.querySelector('#refundCancel');
        const submit = dialog.querySelector('#refundSubmit');
        const reason = dialog.querySelector('#refundReason');
        const result = dialog.querySelector('#refundResult');
        cancel.textContent = t('Cancel', 'إلغاء');
        submit.textContent = t('Confirm refund', 'تأكيد الاسترجاع');
        let pending = false;
        let submitted = false;
        let optionsLoaded = false;
        let productOptions = [];
        submit.disabled = true;
        const close = () => {
            if (pending) return;
            dialog.close();
            dialog.remove();
            refundDialogActive = false;
            previousFocus?.focus();
        };
        reason.addEventListener('input', () => { if (!submitted) result.textContent = ''; });
        cancel.addEventListener('click', close);
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        dialog.querySelector('form').addEventListener('submit', async event => {
            event.preventDefault();
            if (pending || submitted) return;
            if (!optionsLoaded) return;
            const restockItems = [];
            for (const row of dialog.querySelectorAll('[data-return-product]')) {
                if (!row.querySelector('input[type=checkbox]').checked) continue;
                const qty = Number(row.querySelector('input[type=number]').value);
                const option = productOptions.find(option => option.productId === row.dataset.returnProduct);
                if (!Number.isFinite(qty) || qty <= 0 || qty > option.qty) { result.textContent = t('Check intact-goods quantities.', 'راجع كميات البضاعة السليمة.'); return; }
                restockItems.push({ productId: option.productId, qty, intact: true });
            }
            const value = reason.value.trim();
            if (!value) { result.textContent = t('Enter a refund reason.', 'أدخل سبب الاسترجاع.'); reason.focus(); return; }
            submitted = true;
            pending = true;
            submit.disabled = cancel.disabled = reason.disabled = true;
            result.textContent = t('Submitting refund. Do not close this page.', 'جار تنفيذ الاسترجاع. لا تغلق الصفحة.');
            try {
                const response = await window.apiFetch(`/sales/refund/${encodeURIComponent(saleId)}`, {
                    method: 'POST', body: JSON.stringify({ reason: value, restockItems })
                });
                if (response?.success) {
                    result.style.color = '#15803d';
                    result.textContent = restockItems.length > 0 ? t('Return recorded. Intact goods restored to stock.', 'تم تسجيل المرتجع وإعادة البضاعة السليمة للمخزون.') : t('Return recorded. Stock was not restored.', 'تم تسجيل المرتجع. لم تتم إعادة المخزون.');
                    await loadServiceReceipts();
                } else {
                    result.textContent = t('Refund not confirmed. Close and refresh the receipts before trying again. ', 'لم يتم تأكيد الاسترجاع. أغلق النافذة وحدّث الفواتير قبل أي محاولة جديدة. ') + (response?.error || '');
                }
            } catch (error) {
                console.error('Refund response uncertain:', error);
                result.textContent = t('Refund result is uncertain. Close and refresh receipts and stock before any new attempt. Do not repeat automatically.', 'نتيجة الاسترجاع غير مؤكدة. أغلق النافذة وحدّث الفواتير والمخزون قبل أي محاولة جديدة. لا تكرر العملية تلقائيا.');
            } finally {
                pending = false;
                cancel.disabled = false;
                cancel.textContent = t('Close', 'إغلاق');
                submit.hidden = true;
            }
        });
        document.body.appendChild(dialog);
        dialog.showModal();
        reason.focus();
        result.textContent = t('Loading original stock movements...', 'جار تحميل حركة المخزون الأصلية...');
        window.apiFetch(`/sales/${encodeURIComponent(saleId)}/return-options`).then(options => {
            if (!dialog.isConnected) return;
            if (!Array.isArray(options?.products)) throw new Error('Return choices unavailable');
            productOptions = options.products;
            const choices = dialog.querySelector('#refundStockChoices');
            const explanation = document.createElement('p');
            explanation.textContent = t('Default: no stock return. Check ONLY goods you inspected as intact and resellable. Ingredients cannot be selected. This does not change the full financial return.', 'الافتراضي: لا إعادة للمخزون. اختر فقط البضاعة التي فحصتها وهي سليمة وقابلة للبيع. الخامات لا يمكن اختيارها. هذا لا يغير المرتجع المالي الكامل.');
            choices.appendChild(explanation);
            for (const option of productOptions) {
                const row = document.createElement('label');
                row.dataset.returnProduct = option.productId;
                row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap';
                const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = !option.costVerified;
                const name = document.createElement('span'); name.textContent = option.name + (option.costVerified ? '' : t(' (old cost proof missing; manual review)', ' (إثبات التكلفة القديم ناقص، مراجعة يدوية)'));
                const qty = document.createElement('input'); qty.type = 'number'; qty.min = '0.000001'; qty.max = String(option.qty); qty.step = 'any'; qty.value = String(option.qty); qty.disabled = true; qty.style.cssText = 'width:80px;border:1px solid #94a3b8;padding:6px;border-radius:6px'; qty.setAttribute('aria-label', t('Intact quantity: ', 'الكمية السليمة: ') + option.name);
                check.addEventListener('change', () => { qty.disabled = !check.checked; });
                row.append(check, name, qty); choices.appendChild(row);
            }
            optionsLoaded = true; submit.disabled = false; result.textContent = '';
        }).catch(error => {
            if (dialog.isConnected) result.textContent = t('Cannot verify original movements. Close and refresh before returning this receipt.', 'تعذر التحقق من الحركات الأصلية. أغلق النافذة وحدّث البيانات قبل الاسترجاع.');
            console.error('Return choices unavailable:', error);
        });
    }, () => { refundDialogActive = false; });
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
                    <p style="margin:0 0 6px 0; font-size:0.8em;">${t('Powered by <strong>Itqan Solutions</strong>', 'مدعوم من <strong>إتقان سولوشنز</strong>')}</p>
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

    // On-page print preview: render the receipt into a modal on this page and only
    // call window.print() from a real user click. The old flow auto-called print()
    // inside a hidden iframe; when the print dialog cannot open (kiosk/headless
    // browsers) that call blocks the renderer and freezes the whole tab.
    const oldModal = document.getElementById('receiptPrintModal');
    if (oldModal) oldModal.remove();
    const oldStyles = document.getElementById('receiptPrintStyles');
    if (oldStyles) oldStyles.remove();

    const dir = lang === 'ar' ? 'rtl' : 'ltr';

    const styles = document.createElement('style');
    styles.id = 'receiptPrintStyles';
    styles.textContent = `
#receiptPrintModal {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(15, 23, 42, 0.55);
  display: flex; flex-direction: column; align-items: center;
  overflow-y: auto; padding: 24px 12px;
}
#receiptPrintModal .receipt-sheet {
  width: 72mm; max-width: 100%;
  margin: 0; padding: 12px 8px;
  background: #fff; color: #000;
  font-family: Arial, sans-serif;
  font-size: 11.5px; font-weight: bold; line-height: 1.5;
  box-shadow: 0 8px 30px rgba(0,0,0,0.35);
  box-sizing: border-box; height: fit-content;
}
#receiptPrintModal .center { text-align: center; }
#receiptPrintModal img.logo { max-height: 70px; display: block; margin: 0 auto 5px; }
#receiptPrintModal h2 { margin: 3px 0; font-size: 15px; font-weight: bold; }
#receiptPrintModal p { margin: 2px 8px; font-weight: bold; }
#receiptPrintModal table {
  width: 98%; border-collapse: collapse; margin: 8px auto 4px; table-layout: fixed;
}
#receiptPrintModal th, #receiptPrintModal td {
  border: 1px dashed #444; padding: 4px 5px; text-align: center;
  font-size: 11px; white-space: normal; word-break: break-word; font-weight: bold;
}
#receiptPrintModal th:nth-child(1), #receiptPrintModal td:nth-child(1) { width: 35%; text-align: left; }
#receiptPrintModal th:nth-child(2), #receiptPrintModal td:nth-child(2) { width: 12%; }
#receiptPrintModal th:nth-child(3), #receiptPrintModal td:nth-child(3) { width: 18%; }
#receiptPrintModal th:nth-child(4), #receiptPrintModal td:nth-child(4) { width: 18%; }
#receiptPrintModal th:nth-child(5), #receiptPrintModal td:nth-child(5) { width: 17%; }
#receiptPrintModal .summary {
  margin: 10px 8px 0; font-size: 12px; font-weight: bold;
  border-top: 1px solid #000; padding-top: 5px;
}
#receiptPrintModal .footer {
  text-align: center; margin: 12px 0 0; font-size: 10.5px;
  border-top: 1px dashed #ccc; padding-top: 6px; font-weight: bold;
}
#receiptPrintModal .receipt-actions {
  display: flex; gap: 10px; justify-content: center;
  margin: 14px 0 4px; position: sticky; bottom: 8px;
}
#receiptPrintModal .receipt-actions button {
  padding: 10px 22px; border: 0; border-radius: 8px; cursor: pointer;
  font-size: 14px; font-weight: 700;
}
#receiptPrintModal .receipt-actions .do-print { background: #2563eb; color: #fff; }
#receiptPrintModal .receipt-actions .do-close { background: #e2e8f0; color: #0f172a; }
@media print {
  body * { visibility: hidden; }
  #receiptPrintModal, #receiptPrintModal * { visibility: visible; }
  #receiptPrintModal {
    position: absolute; inset: 0; padding: 0;
    background: #fff; overflow: visible; display: block;
  }
  #receiptPrintModal .receipt-sheet { box-shadow: none; width: 72mm; margin: 0; padding: 5px 0; }
  #receiptPrintModal .receipt-actions { display: none !important; }
}`;
    document.head.appendChild(styles);

    const modal = document.createElement('div');
    modal.id = 'receiptPrintModal';
    modal.dir = dir;
    modal.innerHTML = `
  <div class="receipt-sheet">
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
      ${t('Powered by <strong>Itqan Solutions</strong>', 'مدعوم من <strong>إتقان سولوشنز</strong>')}
    </p>
  </div>
  <div class="receipt-actions">
    <button type="button" class="do-print">🖨️ ${t('Print', 'طباعة')}</button>
    <button type="button" class="do-close">${t('Close', 'إغلاق')}</button>
  </div>
`;
    document.body.appendChild(modal);
    modal.querySelector('.do-print').addEventListener('click', () => window.print());
    modal.querySelector('.do-close').addEventListener('click', () => {
        modal.remove();
        const s = document.getElementById('receiptPrintStyles');
        if (s) s.remove();
    });
};
