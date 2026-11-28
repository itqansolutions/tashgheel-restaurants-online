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

    // Initialize Data safely
    if (window.SystemReady) {
        initVendorsApp();
    } else {
        window.addEventListener('SystemDataReady', () => {
            console.log('🚀 System Data Ready - Initializing Vendors');
            initVendorsApp();
        });
        // Failsafe
        setTimeout(() => {
            if (!document.getElementById('vendorsContainer').innerHTML.trim()) initVendorsApp();
        }, 2000);
    }
});

async function initVendorsApp() {
    console.log('Session valid, rendering vendors...');
    try {
        try{await renderVendors();}catch(refreshError){console.warn('Payment saved, refresh failed:',refreshError);alert(t('Payment was saved. Reload the statement to refresh it, do not pay again.','تم حفظ السداد. أعد فتح كشف الحساب لتحديثه، ولا تسدد مرة أخرى.'));}
    } catch (error) {
        console.error('Error rendering vendors:', error);
        alert(t('vendor_load_error') + error.message);
    }

    // Re-render when language changes
    window.addEventListener('languageChanged', () => {
        renderVendors();
    });

    // Auto refresh when returning to page
    window.addEventListener('focus', () => {
        renderVendors();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) renderVendors();
    });
}

let vendorRenderSeq = 0;
async function renderVendors() {
    const renderSeq = ++vendorRenderSeq; // latest call wins: an older, slower render must not overwrite newer data
    console.log('renderVendors called');
    const container = document.getElementById('vendorsContainer');

    if (!container) {
        console.error('vendorsContainer element not found!');
        return;
    }

    // Async Fetch
    const vendors = await window.electronAPI.getVendors() || [];
    console.log('Vendors loaded:', vendors.length);

    // Fetch every vendor's transactions in parallel (was one request after another, which kept the old list on screen for seconds)
    const txResults = await Promise.all(vendors.map(async (v) => {
        const vId = v.id || v._id;
        if (window.apiFetch) {
            try {
                const serverTx = await window.apiFetch(`/parties/vendors/${vId}/transactions`);
                if (Array.isArray(serverTx)) return { vId, trans: serverTx };
            } catch (e) { /* fall back to local cache below */ }
        }
        return { vId, trans: window.DB.getVendorTransactions(vId) || [], local: true };
    }));
    if (renderSeq !== vendorRenderSeq) return; // a newer render started while we waited
    const fetchedIds = new Set(txResults.filter(r => !r.local).map(r => String(r.vId)));
    if (fetchedIds.size) {
        const allTrans = window.EnhancedSecurity.getSecureData('vendor_transactions') || [];
        const otherTrans = allTrans.filter(t => !fetchedIds.has(String(t.vendorId)));
        if (!window.DataCache) window.DataCache = {};
        window.DataCache.vendor_transactions = [...otherTrans, ...txResults.filter(r => !r.local).flatMap(r => r.trans)];
    }

    // Sync to local DB & window.DataCache to ensure other parts (modals, reports) work with up-to-date vendor credit
    if (!window.DataCache) window.DataCache = {};
    window.DataCache['vendors'] = vendors;
    // Cache only: storeSecureData can persist through an integration.
    // Reading a page must not call it for financial entities.

    container.innerHTML = '';

    if (vendors.length === 0) {
        container.innerHTML = `<p style="text-align:center;color:#666;">${t('No vendors yet. Add one to get started.', 'لا يوجد موردين بعد. أضف مورد للبدء.')}</p>`;
        return;
    }

    vendors.forEach(v => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group';

        const creditVal = parseFloat(v.credit) || 0;
        const creditClass = creditVal > 0 ? 'bg-red-50 text-red-600 border-red-100' : creditVal < 0 ? 'bg-green-50 text-green-600 border-green-100' : 'bg-slate-50 text-slate-500 border-slate-100';
        const creditLabel = creditVal > 0 ? t('We Owe', 'علينا') : creditVal < 0 ? t('They Owe', 'لنا') : t('Settled', 'خالص');

        card.innerHTML = `
            <div class="px-5 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-slate-800 text-lg">${v.name}</h3>
                    <div class="flex items-center gap-2 text-slate-500 text-sm mt-1">
                        <span class="material-symbols-outlined text-[16px]">smartphone</span>
                        <span>${v.mobile || 'N/A'}</span>
                    </div>
                </div>
                <div class="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                    ${v.name.charAt(0).toUpperCase()}
                </div>
            </div>

            <div class="p-5 flex-1 space-y-4">
                <div class="flex items-start gap-3 text-sm text-slate-600">
                    <span class="material-symbols-outlined text-slate-400 mt-0.5">store</span>
                    <span>${v.address || 'No address provided'}</span>
                </div>
                
                <div class="flex items-center justify-between p-3 rounded-lg border ${creditClass}">
                    <span class="text-xs font-bold uppercase tracking-wider opacity-80">${creditLabel}</span>
                    <span class="text-lg font-bold">${Math.abs(creditVal).toFixed(2)}</span>
                </div>
            </div>

            <div class="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-2">
                <button class="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm ${creditVal <= 0 ? 'opacity-50 cursor-not-allowed' : ''}" onclick="openPaymentModal('${v._id || v.id}')" ${creditVal <= 0 ? 'disabled' : ''}>
                    <span class="material-symbols-outlined text-[18px]">payments</span>
                    <span>${t('Pay', 'دفع')}</span>
                </button>
                <div class="flex gap-1">
                    <button class="w-9 h-auto flex items-center justify-center bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors" onclick="printVendorReport('${v._id || v.id}')" title="Report">
                        <span class="material-symbols-outlined text-[18px]">description</span>
                    </button>
                    <button class="w-9 h-auto flex items-center justify-center bg-white border border-slate-200 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-colors" onclick="editVendor('${v._id || v.id}')" title="Edit">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button class="w-9 h-auto flex items-center justify-center bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors" onclick="deleteVendor('${v._id || v.id}')" title="Delete">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function openAddVendorModal() {
    const form = document.getElementById('vendorForm');
    if (form) form.reset();
    document.getElementById('vendorId').value = '';
    document.getElementById('vendorModalTitle').textContent = t('Add Vendor', 'إضافة مورد');
    document.getElementById('vendorModal').style.display = 'flex';
}

async function editVendor(id) {
    const vendors = await window.electronAPI.getVendors();
    const vendor = vendors.find(v => (v._id || v.id) == id);
    if (!vendor) return;

    document.getElementById('vendorId').value = vendor._id || vendor.id;
    document.getElementById('vendorName').value = vendor.name;
    document.getElementById('vendorMobile').value = vendor.mobile || '';
    document.getElementById('vendorAddress').value = vendor.address || '';
    document.getElementById('vendorModalTitle').textContent = t('Edit Vendor', 'تعديل مورد');
    document.getElementById('vendorModal').style.display = 'flex';
}

async function handleVendorSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('vendorId').value;
    const vendor = {
        id: id || undefined, // Send as undefined if new
        _id: id || undefined,
        name: document.getElementById('vendorName').value.trim(),
        mobile: document.getElementById('vendorMobile').value.trim(),
        address: document.getElementById('vendorAddress').value.trim()
    };

    console.log('Saving vendor:', vendor);
    const result = await window.electronAPI.saveVendor(vendor);
    console.log('Save result:', result);

    if (result && (result.success !== false)) {
        closeModal('vendorModal');
        renderVendors();
        if (!id) {
            alert(t('vendor_added'));
        } else {
            alert(t('vendor_updated'));
        }
    } else {
        alert("Failed to save vendor");
    }
}

async function deleteVendor(id) {
    if (await window.confirm(t('delete_vendor_confirm'))) {
        await window.electronAPI.deleteVendor(id);
        renderVendors();
    }
}

let vendorPaymentRequestId=null;
let vendorPaymentBusy=false;
function openPaymentModal(vendorId) {
    if(vendorPaymentBusy)return;
    const vendors = (window.DataCache && window.DataCache['vendors']) || window.DB.getVendors() || [];
    const vendor = vendors.find(v => (v.id || v._id) == vendorId || v.name == vendorId);
    if (!vendor) return;

    document.getElementById('paymentVendorId').value = vendor.id || vendor._id || vendorId;
    document.getElementById('paymentVendorName').value = vendor.name;
    document.getElementById('paymentCurrentCredit').value = (parseFloat(vendor.credit) || 0).toFixed(2);
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentNotes').value = '';
    try {
        const pending=JSON.parse(sessionStorage.getItem('vendor-payment-pending:'+(vendor.id||vendor._id||vendorId))||'null');
        if(pending){
            document.getElementById('paymentAmount').value=pending.intent.amount;
            document.getElementById('paymentNotes').value=pending.intent.notes||'';
            vendorPaymentRequestId=pending.requestId;
        }
    }catch(e){alert('Pending payment could not be loaded. Review the statement before submitting.');return;}

    document.getElementById('paymentModal').style.display = 'flex';
}

async function handlePaymentSubmit(e) {
    e.preventDefault();
    if(vendorPaymentBusy)return;
    const vendorId=document.getElementById('paymentVendorId').value;
    const vendorName=document.getElementById('paymentVendorName')?.value||'';
    const amount=Number(document.getElementById('paymentAmount').value);
    const notes=document.getElementById('paymentNotes').value.trim();
    if(!Number.isFinite(amount)||amount<=0){alert(t('payment_amount_error'));return;}
    if(!window.apiFetch){alert(t('Payment requires a server connection. Nothing was recorded.','السداد يحتاج اتصالًا بالخادم. لم يتم تسجيل شيء.'));return;}
    const date=new Date();const today=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    const intent={type:'payment',amount,description:`${t('Vendor Payment','سداد للمورد')}: ${vendorName||vendorId}${notes?' - '+notes:''}`,method:'cash',date:today,notes:notes||null};
    const pendingKey='vendor-payment-pending:'+vendorId;
    let pending;
    try{pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch(e){alert('Could not verify pending payment. Reload and review the statement.');return;}
    if(pending)intent.date=pending.intent.date;
    if(pending && JSON.stringify(pending.intent)!==JSON.stringify(intent)){alert(t('An earlier payment is unconfirmed. Retry its original details or ask the manager to reconcile it first.','هناك سداد سابق غير مؤكد. أعد بياناته الأصلية أو اطلب من المسؤول مراجعته أولًا.'));return;}
    pending=pending||{requestId:crypto.randomUUID(),intent};
    try{sessionStorage.setItem(pendingKey,JSON.stringify(pending));}catch(e){alert('Cannot preserve safe retry. No payment was submitted.');return;}
    vendorPaymentRequestId=pending.requestId;
    vendorPaymentBusy=true;
    const button=e.submitter;if(button)button.disabled=true;
    let confirmed=false;
    try {
        const result=await window.apiFetch(`/parties/vendors/${vendorId}/transactions`,{method:'POST',body:JSON.stringify({...pending.intent,requestId:vendorPaymentRequestId})});
        if(!result?.success)throw new Error('Server did not confirm payment');
        confirmed=true;
        // Refresh the authoritative ledger. Never create a second local financial transaction.
        sessionStorage.removeItem(pendingKey);alert(t('payment_recorded'));closeModal('paymentModal');vendorPaymentRequestId=null;
        try{await renderVendors();}catch(refreshError){console.warn('Payment saved, refresh failed:',refreshError);alert(t('Payment was saved. Reload the statement to refresh it, do not pay again.','تم حفظ السداد. أعد فتح كشف الحساب لتحديثه، ولا تسدد مرة أخرى.'));}
    }catch(err){
        console.warn('Vendor payment result handling:',err);
        if(confirmed){alert(t('Payment was saved. Reload the statement to refresh it, do not pay again.','تم حفظ السداد. أعد فتح كشف الحساب لتحديثه، ولا تسدد مرة أخرى.'));return;}
        alert(t('Payment was not confirmed. Check the statement and retry unchanged; do not record a second payment.','لم يتم تأكيد السداد. راجع كشف الحساب وأعد المحاولة بنفس البيانات، ولا تسجل سدادًا ثانيًا.'));
    }finally{vendorPaymentBusy=false;if(button)button.disabled=false;}
}

// Print Vendor Transaction Report
window.printVendorReport = function printVendorReport(vendorId) {
    console.log('printVendorReport called with vendorId:', vendorId);

    // Define lang early
    const lang = localStorage.getItem('pos_language') || 'en';
    const isRTL = lang === 'ar';

    // Stored transaction descriptions are written in English (some server-side);
    // localize the known prefixes for the Arabic statement.
    // Units written by the inventory flows stay in the description; render them
    // in Arabic too (ml before l, kg before g).
    const localizeUnits = (text) => String(text || '')
        .replace(/(\d)\s?ml\b/gi, '$1 مل')
        .replace(/(\d)\s?kg\b/gi, '$1 كجم')
        .replace(/(\d)\s?g\b/gi, '$1 جم')
        .replace(/(\d)\s?l\b/gi, '$1 لتر')
        .replace(/(\d)\s?pcs\b/gi, '$1 قطعة');
    const localizeDesc = (d) => {
        if (lang !== 'ar') return d;
        return localizeUnits(String(d || '')
            .replace(/^Raw Material Purchase:\s*/i, 'شراء خامات: ')
            .replace(/^Material purchase:\s*/i, 'شراء خامات: ')
            .replace(/^Vendor Payment:\s*/i, 'سداد للمورد: '));
    };

    const vendor = window.DB.getVendor(vendorId);
    if (!vendor) {
        console.error('Vendor not found:', vendorId);
        return;
    }

    // 1. Get Unified Transactions (Purchases & Payments)
    let allTransactions = window.DB.getVendorTransactions(vendorId) || [];

    // 2. Compatibility: If no unified transactions exist, check for legacy 'vendor_payments'
    // Do not reconstruct missing financial history.

    // Sort by date
    allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate sum of LOGGED transactions
    // Note: Purchase is positive (increases debt), Payment is negative (decreases debt) in the log logic?
    // Let's verify db.js addVendorTransaction:
    // purchase -> updateVendorCredit(+, amount)
    // payment -> updateVendorCredit(-, amount)
    // But how is it stored in the transaction object itself?
    // It is stored as `amount`. We need to normalize for the calculation.
    // If type === 'payment', it reduces debt.

    const calculatedTransactions = allTransactions.map(t => {
        let signedAmount = parseFloat(t.amount);
        if (t.type === 'payment') signedAmount = -Math.abs(signedAmount);

        return {
            ...t,
            signedAmount: signedAmount
        };
    });

    const totalLogValue = calculatedTransactions.reduce((sum, t) => sum + t.signedAmount, 0);

    // Calculate sum of known transactions
    const recordedCredit = parseFloat(vendor.credit || 0);

    const mismatch = recordedCredit - totalLogValue;
    // Never fabricate an opening-balance transaction to make the statement fit.

    // Calculate running balance
    let balance = 0;
    const transactionsWithBalance = calculatedTransactions.map(t => {
        balance += t.signedAmount;
        return {
            ...t,
            balance: balance,
            // Visual Amount (always positive for display, color indicates direction)
            displayAmount: Math.abs(t.signedAmount),
            displayDate: t.date ? new Date(t.date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : 'N/A'
        };
    });

    // Get shop settings
    const shopName = localStorage.getItem('shopName') || 'Tashgheel F&B';
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
                    ${vendor.contact ? `<p><strong>${t('Contact', 'جهة الاتصال')}:</strong> ${vendor.contact}</p>` : ''}
                    <p><strong>${t('Phone', 'الهاتف')}:</strong> ${vendor.mobile || '-'}</p>
                    <p><strong>${t('Report Date', 'تاريخ التقرير')}:</strong> ${new Date().toLocaleDateString()}</p>
                </div>

                ${Math.abs(mismatch) > 0.01 ? `<p role="alert" style="padding:12px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e">${t('Stored balance differs from recorded transactions. No adjustment was added. Manual reconciliation required. Difference:', 'الرصيد المسجل مختلف عن مجموع الحركات. لم تتم إضافة تسوية. يلزم مراجعة يدوية. الفرق:')} ${mismatch.toFixed(2)}</p>` : ''}
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
                                    ${tr.type === 'purchase' ? t('Purchase', 'شراء') : tr.type === 'payment' ? t('Payment', 'دفع') : tr.type}
                                </td>
                                <td style="padding: 10px; border: 1px solid #ddd;">${localizeDesc(tr.description)}</td>
                                <td style="padding: 10px; border: 1px solid #ddd; color: ${tr.signedAmount > 0 ? '#e74c3c' : '#27ae60'};">
                                    ${tr.signedAmount > 0 && !tr.isAdjustment ? '+' : ''}${tr.displayAmount.toFixed(2)}
                                </td>
                                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${tr.balance.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                        <tr class="total-row" style="background: #ecf0f1; font-weight: bold;">
                            <td colspan="4" style="padding: 12px; border: 1px solid #ddd; text-align: ${isRTL ? 'left' : 'right'};">${t('Stored Account Balance (not an adjustment):', 'رصيد الحساب المسجل (ليس تسوية):')}</td>
                            <td style="padding: 12px; border: 1px solid #ddd;">${vendor.credit.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer" style="margin-top: 30px; padding: 15px; background: #2c3e50; color: white; text-align: center; border-radius: 6px;">
                    <p style="margin:5px 0;"><strong>Tashgheel F&B</strong> - ${t('Powered by <strong>Itqan Solutions</strong>', 'مدعوم من <strong>إتقان سولوشنز</strong>')}</p>
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

// Print All Vendors Summary
window.printAllVendorsReport = function () {
    const lang = localStorage.getItem('pos_language') || 'en';
    const isRTL = lang === 'ar';
    const vendors = window.DB.getVendors();
    const shopName = localStorage.getItem('shopName') || 'Tashgheel Services';

    let totalDebt = 0;
    let totalCredit = 0;

    const rows = vendors.map(v => {
        const credit = v.credit || 0; // Postive = Owe Vendor, Negative = Vendor Owes Us
        if (credit > 0) totalDebt += credit;
        else totalCredit += Math.abs(credit);

        return `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px; border: 1px solid #ddd;">${v.name}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${v.mobile || '-'}</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align: ${isRTL ? 'left' : 'right'}; font-weight: bold; color: ${credit > 0 ? '#e74c3c' : (credit < 0 ? '#27ae60' : '#7f8c8d')}">
                    ${credit.toFixed(2)}
                </td>
            </tr>
        `;
    }).join('');

    const html = `
        <html>
        <head>
            <title>${t('Vendor Summary', 'ملخص الموردين')}</title>
            <style>
                body { font-family: Arial, sans-serif; direction: ${isRTL ? 'rtl' : 'ltr'}; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #34495e; color: white; padding: 12px; border: 1px solid #ddd; }
                .summary-box { margin-top:30px; display:flex; gap:20px; justify-content:flex-end; }
                .box { padding:15px; border-radius:8px; border:1px solid #ddd; min-width:150px; text-align:center; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div style="text-align: center; margin-bottom: 30px;">
                <h1>${shopName}</h1>
                <h2>${t('Vendor Indebtedness Report', 'تقرير مديونية الموردين')}</h2>
                <p>${new Date().toLocaleDateString()}</p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="text-align: ${isRTL ? 'right' : 'left'}">${t('Vendor', 'المورد')}</th>
                        <th style="text-align: ${isRTL ? 'right' : 'left'}">${t('Mobile', 'الجوال')}</th>
                        <th style="text-align: ${isRTL ? 'left' : 'right'}">${t('Balance (You Owe)', 'الرصيد (مستحق عليك)')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>

            <div class="summary-box">
                <div class="box" style="background:#ffebee; border-color:#ef5350; color:#c62828;">
                    <strong>${t('Total Debt (Payable)', 'إجمالي المستحق للموردين')}</strong><br>
                    <span style="font-size:1.5em; font-weight:bold;">${totalDebt.toFixed(2)}</span>
                </div>
                <div class="box" style="background:#e8f5e9; border-color:#66bb6a; color:#2e7d32;">
                    <strong>${t('Vendor Credit (Receivable)', 'إجمالي المستحق لنا')}</strong><br>
                    <span style="font-size:1.5em; font-weight:bold;">${totalCredit.toFixed(2)}</span>
                </div>
            </div>

            <div class="no-print" style="text-align: center; margin-top: 40px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #34495e; color: white; border: none; cursor: pointer;">🖨️ Print</button>
            </div>
            <script>window.onload = () => window.print();</script>
        </body>
        </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
};

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// setLanguage and handleLogout are now handled globally
