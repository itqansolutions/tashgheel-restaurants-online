/**
 * Vendor Report Logic
 */
window.currentPage = 'vendors';

document.addEventListener('DOMContentLoaded', () => {
    if (!window.isSessionValid()) {
        window.location.href = 'index.html';
        return;
    }

    renderVendorReport();
});

function renderVendorReport() {
    const vendors = window.DB.getVendors();
    const payments = window.DB.getVendorPayments();
    const parts = window.DB.getParts();

    // Calculate totals
    let totalDebt = 0;
    let totalPaid = 0;
    let activeVendors = 0;

    const vendorStats = vendors.map(vendor => {
        // Calculate total purchases (from parts with this vendor)
        // 🚀 CONFIRMATION: 'parts' here represents Stock Inventory. 
        // Ideally we should sum PURCHASES (Invoices), not just current stock value.
        // But assuming 'parts' tracks simplified stock-based debt:
        const vendorParts = parts.filter(p => p.vendorId == vendor.id);

        // 🚀 LOGIC REFINEMENT: Ensure we only count POSITIVE cost * stock (Inventory Value)
        // OR better: if we have a proper 'purchase_invoices' collection, use that.
        // For now, based on existing code structure:
        const totalPurchases = vendorParts.reduce((sum, p) => {
            return sum + ((p.cost || 0) * (p.stock || 0));
        }, 0);

        // Calculate total paid to this vendor
        const vendorPayments = payments.filter(p => p.vendorId == vendor.id);
        const paid = vendorPayments.reduce((sum, p) => sum + p.amount, 0);

        // Current balance calculation
        // Formula: Total Purchases - Total Paid
        // Note: vendor.credit is legacy "Starting Balance". We should ideally use that + purchases - payments.
        const startingBalance = vendor.credit || 0; // Legacy / Opening Balance
        const balance = (startingBalance + totalPurchases) - paid;

        if (balance > 0) {
            totalDebt += balance;
            activeVendors++;
        }
        totalPaid += paid;

        return {
            vendor,
            totalPurchases,
            paid,
            balance,
            status: balance > 0 ? 'Pending' : balance < 0 ? 'Overpaid' : 'Settled'
        };
    });

    // Update summary cards
    document.getElementById('totalDebt').textContent = totalDebt.toFixed(2);
    document.getElementById('totalPaid').textContent = totalPaid.toFixed(2);
    document.getElementById('vendorCount').textContent = activeVendors;

    // Render vendor details table
    const detailsTable = document.getElementById('vendorDetailsTable');
    detailsTable.innerHTML = '';

    if (vendorStats.length === 0) {
        detailsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;">No vendors found.</td></tr>';
    } else {
        vendorStats.forEach(stat => {
            const row = document.createElement('tr');
            const statusColor = stat.balance > 0 ? '#e74c3c' : stat.balance < 0 ? '#f39c12' : '#27ae60';

            row.innerHTML = `
                <td><strong>${stat.vendor.name}</strong></td>
                <td>${stat.vendor.mobile || 'N/A'}</td>
                <td>${stat.totalPurchases.toFixed(2)}</td>
                <td style="color:#27ae60;">${stat.paid.toFixed(2)}</td>
                <td style="color:${statusColor}; font-weight:bold;">${Math.abs(stat.balance).toFixed(2)}</td>
                <td><span style="background:${statusColor};color:white;padding:3px 8px;border-radius:4px;font-size:0.85em;">${stat.status}</span></td>
            `;
            detailsTable.appendChild(row);
        });
    }

    // Render payment history
    const historyTable = document.getElementById('paymentHistoryTable');
    historyTable.innerHTML = '';

    if (payments.length === 0) {
        historyTable.innerHTML = '<tr><td colspan="4" style="text-align:center;">No payments recorded.</td></tr>';
    } else {
        // Sort by date descending
        const sortedPayments = [...payments].sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedPayments.forEach(payment => {
            const vendor = vendors.find(v => v.id === payment.vendorId);
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${new Date(payment.date).toLocaleDateString()}</td>
                <td>${vendor?.name || 'Unknown'}</td>
                <td style="color:#27ae60;font-weight:bold;">${payment.amount.toFixed(2)}</td>
                <td>${payment.notes || '-'}</td>
            `;
            historyTable.appendChild(row);
        });
    }
}

function setLanguage(lang) {
    localStorage.setItem('pos_language', lang);
    location.reload();
}
