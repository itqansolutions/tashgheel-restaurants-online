
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
        const itemTotal = item.price * item.qty;
        let discountAmount = 0;

        if (item.discount?.type === "percent") {
            discountAmount = itemTotal * (item.discount.value / 100);
        } else if (item.discount?.type === "value") {
            discountAmount = item.discount.value;
        }

        // In the saved receipt, 'price' might be unit price *after* discount or before?
        // Usually dependent on how it was saved. in pos-app.js:
        // calculateTotal uses finalPrice * qty.
        // item.price in cart loop uses basePrice + addons.
        // Let's assume item.price is unit price.

        // Correct calculation for display:
        const lineTotal = (item.price * item.qty) - discountAmount;
        subtotal += (item.price * item.qty);
        totalDiscount += discountAmount;

        return `
            <tr style="border-bottom: 1px dashed #ddd;">
                <td style="padding: 5px; text-align: ${isArabic ? 'right' : 'left'};">
                    ${item.name} <br>
                    <small style="color:#777;">${item.qty} x ${item.price.toFixed(2)}</small>
                </td>
                <td style="padding: 5px; text-align: ${isArabic ? 'left' : 'right'};">
                    ${lineTotal.toFixed(2)}
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
                    <span>${t('subtotal')}</span>
                    <span>${subtotal.toFixed(2)}</span>
                </div>
                ${totalDiscount > 0 ? `
                <div style="display:flex; justify-content:space-between; font-size:14px; color:red;">
                    <span>${t('discount')}</span>
                    <span>-${totalDiscount.toFixed(2)}</span>
                </div>
                ` : ''}
                
                ${receipt.deliveryFee > 0 ? `
                <div style="display:flex; justify-content:space-between; font-size:14px;">
                    <span>${t('delivery_fee') || 'Delivery'}</span>
                    <span>${receipt.deliveryFee.toFixed(2)}</span>
                </div>
                ` : ''}

                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px; margin-top:5px;">
                    <span>${t('total')}</span>
                    <span>${receipt.total.toFixed(2)}</span>
                </div>

                ${receipt.customer ? `
                <hr style="border-top: 1px dashed #000;">
                <div style="text-align:${isArabic ? 'right' : 'left'}; font-size:12px;">
                    <b>${t('customer_info') || 'Customer'}:</b><br>
                    ${receipt.customer.name}<br>
                    ${receipt.customer.mobile}<br>
                    ${receipt.customer.address ? formatReceiptAddress(receipt.customer.address) : ''}
                </div>
                ` : ''}

                <hr style="border-top: 1px dashed #000;">

                <div style="text-align:center; font-size:12px; margin-top:10px;">
                    <p>${shopFooter}</p>
                    <p>${t('cashier')}: ${receipt.cashier}</p>
                </div>

                <div style="margin-top:20px; text-align:center;" class="no-print">
                    <button onclick="window.print()" class="btn btn-primary btn-sm">🖨️ ${t('print')}</button>
                    <button onclick="document.getElementById('receiptModal').remove()" class="btn btn-secondary btn-sm">❌ ${t('close')}</button>
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

function formatReceiptAddress(addr) {
    // Minimal format for receipt
    return `${addr.area} - ${addr.street} ${addr.building ? 'B:' + addr.building : ''} ${addr.floor ? 'F:' + addr.floor : ''} ${addr.apt ? 'Apt:' + addr.apt : ''}`;
}
