/**
 * Vendor Management Logic
 */

// Hybrid Translation Helper
const t = (keyOrEn, ar) => {
    const lang = localStorage.getItem('pos_language') || 'en';
    if (ar) return lang === 'ar' ? ar : keyOrEn;
    if (window.translations && window.translations[keyOrEn]) {
        return window.translations[keyOrEn][lang];
    }
    return keyOrEn;
};

// vendors-app.js
window.currentPage = 'vendors';
document.addEventListener('DOMContentLoaded', () => {
    console.log('Vendors page loading...');

    if (!window.isSessionValid()) {
        console.log('Session invalid, redirecting...');
        window.location.href = 'index.html';
        return;
    }

    console.log('Session valid, rendering vendors...');
    try {
        renderVendors();
    } catch (error) {
        console.error('Error rendering vendors:', error);
        alert(t('vendor_load_error') + error.message);
    }

    // Re-render when language changes
    window.addEventListener('languageChanged', () => {
        renderVendors();
    });
});

function renderVendors() {
    console.log('renderVendors called');
    const container = document.getElementById('vendorsContainer');

    if (!container) {
        console.error('vendorsContainer element not found!');
        return;
    }

    const vendors = window.DB.getVendors();
    console.log('Vendors loaded:', vendors.length);

    container.innerHTML = '';

    if (vendors.length === 0) {
        container.innerHTML = `<p style="text-align:center;color:#666;">${t('No vendors yet. Add one to get started.', 'لا يوجد موردين بعد. أضف مورد للبدء.')}</p>`;
        return;
    }

    vendors.forEach(v => {
        const card = document.createElement('div');
        card.className = 'vendor-card';

        const creditClass = v.credit > 0 ? 'credit-negative' : v.credit < 0 ? 'credit-positive' : '';
        const creditLabel = v.credit > 0 ? t('We Owe', 'علينا') : v.credit < 0 ? t('They Owe', 'لنا') : t('Settled', 'خالص');

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h3>${v.name}</h3>
                    <p style="margin:5px 0; color:#666;">📱 ${v.mobile || 'N/A'}</p>
                    <p style="margin:5px 0; color:#666;">📍 ${v.address || 'N/A'}</p>
                </div>
                <div style="text-align:right;">
                    <div class="${creditClass}" style="font-size:1.2em; margin-bottom:10px;">
                        ${creditLabel}: ${Math.abs(v.credit || 0).toFixed(2)}
                    </div>
                    <button class="btn btn-sm btn-success" onclick="openPaymentModal(${v.id})" ${v.credit <= 0 ? 'disabled' : ''}>💰 ${t('Pay', 'دفع')}</button>
                    <button class="btn btn-sm btn-info" onclick="printVendorReport('${v.id}')">📄 ${t('Report', 'تقرير')}</button>
                    <button class="btn btn-sm btn-secondary" onclick="editVendor(${v.id})">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteVendor(${v.id})">🗑️</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function openAddVendorModal() {
    document.getElementById('vendorForm').reset();
    document.getElementById('vendorId').value = '';
    document.getElementById('vendorModalTitle').textContent = t('Add Vendor', 'إضافة مورد');
    document.getElementById('vendorModal').style.display = 'flex';
}

function editVendor(id) {
    const vendor = window.DB.getVendors().find(v => v.id === id);
    if (!vendor) return;

    document.getElementById('vendorId').value = vendor.id;
    document.getElementById('vendorName').value = vendor.name;
    document.getElementById('vendorMobile').value = vendor.mobile || '';
    document.getElementById('vendorAddress').value = vendor.address || '';
    document.getElementById('vendorModalTitle').textContent = t('Edit Vendor', 'تعديل مورد');
    document.getElementById('vendorModal').style.display = 'flex';
}

function handleVendorSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('vendorId').value;
    const vendor = {
        id: id ? parseInt(id) : Date.now(),
        name: document.getElementById('vendorName').value.trim(),
        mobile: document.getElementById('vendorMobile').value.trim(),
        address: document.getElementById('vendorAddress').value.trim()
    };

    console.log('Saving vendor:', vendor);
    const success = window.DB.saveVendor(vendor);
    console.log('Save result:', success);

    closeModal('vendorModal');
    renderVendors();

    if (!id) {
        alert(t('vendor_added'));
    } else {
        alert(t('vendor_updated'));
    }
}

function deleteVendor(id) {
    if (confirm(t('delete_vendor_confirm'))) {
        window.DB.deleteVendor(id);
        renderVendors();
    }
}

function openPaymentModal(vendorId) {
    const vendor = window.DB.getVendors().find(v => v.id === vendorId);
    if (!vendor) return;

    document.getElementById('paymentVendorId').value = vendor.id;
    document.getElementById('paymentVendorName').value = vendor.name;
    document.getElementById('paymentCurrentCredit').value = (vendor.credit || 0).toFixed(2);
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentNotes').value = '';

    document.getElementById('paymentModal').style.display = 'flex';
}

function handlePaymentSubmit(e) {
    e.preventDefault();

    const vendorId = parseInt(document.getElementById('paymentVendorId').value);
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const notes = document.getElementById('paymentNotes').value.trim();

    if (amount <= 0) {
        alert(t('payment_amount_error'));
        return;
    }

    window.DB.recordVendorPayment(vendorId, amount, notes);

    alert(t('payment_recorded'));
    closeModal('paymentModal');
    renderVendors();
}

// Print Vendor Transaction Report
window.printVendorReport = function printVendorReport(vendorId) {
    console.log('printVendorReport called with vendorId:', vendorId);

    // Define lang early
    const lang = localStorage.getItem('pos_language') || 'en';
    const isRTL = lang === 'ar';

    const vendor = window.DB.getVendor(vendorId);
    if (!vendor) {
        console.error('Vendor not found:', vendorId);
        return;
    }

    const payments = window.DB.getVendorPayments(vendorId);

    // Get all transactions (purchases from parts + payments)
    const parts = window.DB.getParts();
    console.log('All parts:', parts);
    console.log('Looking for vendorId:', vendorId);

    const vendorParts = parts.filter(p => p.vendorId == vendorId);
    console.log('Vendor parts found:', vendorParts);

    const purchases = vendorParts.map(p => {
        // Use initialStock if available (original purchase), otherwise current stock
        const quantity = p.initialStock || p.stock || 0;
        const unitCost = p.cost || 0;
        const amount = unitCost * quantity;

        console.log(`Part: ${p.name}, cost: ${unitCost}, quantity: ${quantity}, amount: ${amount}`);

        return {
            date: p.createdAt || p.lastRestockDate || new Date().toISOString(),
            type: 'Purchase',
            amount: amount,
            description: `${p.name} - ${quantity} units @ ${unitCost.toFixed(2)}`
        };
    }).filter(p => p.amount > 0);

    console.log('Purchase transactions:', purchases);
    console.log('Payment transactions:', payments);

    // Combine and sort all transactions
    let allTransactions = [
        ...purchases,
        ...payments.map(pay => ({
            date: pay.date,
            type: 'Payment',
            amount: -pay.amount,
            description: pay.notes || 'Payment'
        }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate sum of known transactions
    const totalTransactionValue = allTransactions.reduce((sum, t) => sum + t.amount, 0);
    const recordedCredit = parseFloat(vendor.credit || 0);

    // If there is a mismatch, insert an "Opening Balance" transaction to reconcile
    // Mismatch = Actual (Stored) - Calculated
    // If mismatch is significant (e.g. > 0.01)
    const mismatch = recordedCredit - totalTransactionValue;

    if (Math.abs(mismatch) > 0.01) {
        // Prepend opening balance
        allTransactions.unshift({
            date: vendor.createdAt || new Date().toISOString(),
            type: 'Opening Balance',
            amount: mismatch,
            description: t('Previous Balance / Adjustment', 'رصيد سابق / تسوية'),
            isAdjustment: true
        });
    }

    // Calculate running balance
    let balance = 0;
    const transactionsWithBalance = allTransactions.map(t => {
        balance += t.amount;
        return {
            ...t,
            balance,
            displayDate: t.date ? new Date(t.date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : 'N/A'
        };
    });

    // Get shop settings
    const shopName = localStorage.getItem('shopName') || 'Tashgheel Services';
    const shopLogo = localStorage.getItem('shopLogo') || '';

    // Inject Modal Report
    const reportHTML = `
        <div id="reportModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,1); z-index:99999; overflow-y:auto; font-family: Arial, sans-serif; direction: ${isRTL ? 'rtl' : 'ltr'};">
            <div style="max-width:800px; margin:20px auto; padding:20px; background:white;">
                <div class="header" style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #2c3e50; padding-bottom: 20px;">
                    ${shopLogo ? `<img src="${shopLogo}" alt="Logo" style="max-height: 80px; margin-bottom: 10px;">` : ''}
                    <h1 style="margin: 10px 0; color: #2c3e50;">${shopName}</h1>
                    <h2 style="margin: 5px 0; font-size:1.2em;">${t('Vendor Transaction Report', 'تقرير معاملات المورد')}</h2>
                </div>

                <div class="vendor-info" style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <h3 style="margin-top:0;">${t('Vendor', 'المورد')}: ${vendor.name}</h3>
                    <p><strong>${t('Contact', 'جهة الاتصال')}:</strong> ${vendor.contact || 'N/A'}</p>
                    <p><strong>${t('Phone', 'الهاتف')}:</strong> ${vendor.mobile || 'N/A'}</p>
                    <p><strong>${t('Report Date', 'تاريخ التقرير')}:</strong> ${new Date().toLocaleDateString()}</p>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <thead>
                        <tr style="background: #34495e; color: white;">
                            <th style="padding: 12px; border: 1px solid #ddd; text-align: ${isRTL ? 'right' : 'left'};">${t('Date', 'التاريخ')}</th>
                            <th style="padding: 12px; border: 1px solid #ddd; text-align: ${isRTL ? 'right' : 'left'};">${t('Type', 'النوع')}</th>
                            <th style="padding: 12px; border: 1px solid #ddd; text-align: ${isRTL ? 'right' : 'left'};">${t('Description', 'الوصف')}</th>
                            <th style="padding: 12px; border: 1px solid #ddd; text-align: ${isRTL ? 'right' : 'left'};">${t('Amount', 'المبلغ')}</th>
                            <th style="padding: 12px; border: 1px solid #ddd; text-align: ${isRTL ? 'right' : 'left'};">${t('Balance', 'الرصيد')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactionsWithBalance.map(tr => `
                            <tr style="border-bottom: 1px solid #eee;">
                                <td style="padding: 10px; border: 1px solid #ddd;">${tr.displayDate}</td>
                                <td style="padding: 10px; border: 1px solid #ddd;">
                                    ${tr.type === 'Opening Balance' ? t('Opening Balance', 'رصيد افتتاحي') : t(tr.type, tr.type === 'Purchase' ? 'شراء' : 'دفع')}
                                </td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${tr.description}</td>
                                <td style="padding: 10px; border: 1px solid #ddd; color: ${tr.amount > 0 ? '#e74c3c' : '#27ae60'};">
                                    ${tr.amount > 0 && !tr.isAdjustment ? '+' : ''}${tr.amount.toFixed(2)}
                                </td>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${tr.balance.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                        <tr class="total-row" style="background: #ecf0f1; font-weight: bold;">
                            <td colspan="4" style="padding: 12px; border: 1px solid #ddd; text-align: ${isRTL ? 'left' : 'right'};">${t('Current Balance:', 'الرصيد الحالي:')}</td>
                            <td style="padding: 12px; border: 1px solid #ddd;">${vendor.credit.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer" style="margin-top: 30px; padding: 15px; background: #2c3e50; color: white; text-align: center; border-radius: 6px;">
                    <p style="margin:5px 0;"><strong>Tashgheel Services</strong> - Powered by itqan solutions</p>
                    <p style="margin:5px 0;">📧 info@itqansolutions.org | 📱 +201126522373 / +201155253886</p>
                </div>

                <div class="no-print" style="text-align: center; margin-top: 20px;">
                    <button onclick="window.print()" class="btn btn-primary" style="padding: 10px 20px;">🖨️ ${t('Print Report', 'طباعة التقرير')}</button>
                    <button onclick="document.getElementById('reportModal').remove()" class="btn btn-secondary" style="padding: 10px 20px; margin-left: 10px;">${t('Close', 'إغلاق')}</button>
                </div>
            </div>
            
            <style>
                @media print {
                    .no-print { display: none !important; }
                    body > *:not(#reportModal) { display: none !important; }
                    #reportModal { 
                        position: absolute !important; 
                        top: 0 !important; 
                        left: 0 !important;
                        width: 100% !important; 
                        height: auto !important; 
                        background: white !important;
                        overflow: visible !important;
                        z-index: 999999 !important;
                    }
                }
            </style>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', reportHTML);
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// setLanguage and handleLogout are now handled globally
