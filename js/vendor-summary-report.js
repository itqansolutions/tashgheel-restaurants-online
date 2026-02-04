// Vendor Summary Report Logic
window.currentPage = 'vendors';

document.addEventListener('DOMContentLoaded', () => {
    if (!window.isSessionValid()) {
        window.location.href = 'index.html';
        return;
    }

    loadVendorSummary();
});

function loadVendorSummary() {
    const vendors = window.DB.getVendors();
    const allPayments = window.DB.getVendorPayments();
    const parts = JSON.parse(localStorage.getItem('products') || '[]');

    let totalPurchases = 0;
    let totalPayments = 0;
    let totalBalance = 0;

    const vendorData = vendors.map(vendor => {
        // Calculate purchases for this vendor
        const vendorParts = parts.filter(p => p.vendorId == vendor.id);
        const purchases = vendorParts.reduce((sum, p) => {
            return sum + ((p.cost || 0) * (p.initialStock || p.stock || 0));
        }, 0);

        // Calculate payments for this vendor
        const payments = allPayments
            .filter(pay => pay.vendorId == vendor.id)
            .reduce((sum, pay) => sum + pay.amount, 0);

        const balance = purchases - payments;

        totalPurchases += purchases;
        totalPayments += payments;
        totalBalance += balance;

        return {
            vendor,
            purchases,
            payments,
            balance
        };
    });

    // Update summary cards
    document.getElementById('totalPurchases').textContent = totalPurchases.toFixed(2);
    document.getElementById('totalPayments').textContent = totalPayments.toFixed(2);
    document.getElementById('currentBalance').textContent = totalBalance.toFixed(2);

    // Render vendor table
    const tbody = document.getElementById('vendorSummaryBody');
    tbody.innerHTML = '';

    if (vendorData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No vendors found</td></tr>';
        return;
    }

    vendorData.forEach(vd => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${vd.vendor.name}</strong></td>
            <td class="purchase">+${vd.purchases.toFixed(2)}</td>
            <td class="payment">-${vd.payments.toFixed(2)}</td>
            <td><strong>${vd.balance.toFixed(2)}</strong></td>
            <td>
                <button class="btn btn-sm btn-info" onclick="viewVendorDetails('${vd.vendor.id}')">📄 Details</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function viewVendorDetails(vendorId) {
    // Redirect to vendor report page
    window.location.href = `vendors.html`;
    // After redirect, trigger the report
    setTimeout(() => {
        if (typeof printVendorReport === 'function') {
            printVendorReport(vendorId);
        }
    }, 500);
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        if (typeof logout === 'function') {
            logout();
        } else {
            localStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        }
    }
}
