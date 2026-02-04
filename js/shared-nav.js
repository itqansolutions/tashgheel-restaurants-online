/**
 * Shared Navigation and Footer Component
 * Include this in all pages for consistent UI
 */

const navigationTranslations = {
    en: {
        service_visits: '🔧 Service Visits',
        vendors: '🏪 Vendors',
        customers: '👥 Customers',
        spare_parts: '📦 Spare Parts',
        receipts: '🧾 Receipts',
        reports: '📈 Reports',
        employees: '👔 Employees',
        expenses: '💰 Expenses',
        admin_panel: '⚙️ Admin Panel',
        backup: '💾 Backup',
        logout: '🚪 Logout'
    },
    ar: {
        service_visits: '🔧 زيارات الصيانة',
        vendors: '🏪 الموردين',
        customers: '👥 العملاء',
        spare_parts: '📦 قطع الغيار',
        receipts: '🧾 الفواتير',
        reports: '📈 التقارير',
        employees: '👔 الموظفين',
        expenses: '💰 المصاريف',
        admin_panel: '⚙️ لوحة التحكم',
        backup: '💾 النسخ الاحتياطي',
        logout: '🚪 تسجيل الخروج'
    }
};

function renderNavigation(activePage) {
    const lang = localStorage.getItem('pos_language') || 'en';
    const t = navigationTranslations[lang];

    const navItems = [
        { page: 'pos', label: '🛒 POS', href: 'pos.html' },
        { page: 'menu', label: '🍔 Menu', href: 'products.html' }, // Products = Menu Items
        { page: 'inventory', label: '🥩 Inventory', href: 'inventory.html' }, // Raw Materials
        { page: 'customers', label: t.customers, href: 'customers.html' },
        { page: 'orders', label: '👩‍🍳 Kitchen', href: 'kitchen.html' }, // Placeholder
        { page: 'vendors', label: t.vendors, href: 'vendors.html' },
        { page: 'expenses', label: t.expenses, href: 'expenses.html' },
        { page: 'salesmen', label: t.employees, href: 'salesmen.html' },
        { page: 'receipts', label: t.receipts, href: 'receipts.html' },
        { page: 'reports', label: t.reports, href: 'reports.html' },
        { page: 'admin', label: t.admin_panel, href: 'admin.html' },
        { page: 'backup', label: t.backup, href: 'backup.html' }
    ];

    let navHTML = '';
    navItems.forEach(item => {
        const activeClass = activePage === item.page ? 'active' : '';
        navHTML += `<a href="${item.href}" class="nav-item ${activeClass}">${item.label}</a>\n`;
    });

    navHTML += `<a href="#" onclick="handleLogout(); return false;" class="nav-item">${t.logout}</a>`;

    return navHTML;
}

function renderFooter() {
    const lang = localStorage.getItem('pos_language') || 'en';

    return `
        <div class="sidebar-footer" style="text-align:center; padding:15px; font-size:0.85em; border-top:1px solid #34495e;">
            <strong>Tashgheel Services</strong><br>
            <small style="color:#95a5a6;">powered by itqansolutions © 2025</small><br>
            <small style="color:#95a5a6;">
                📧 info@itqansolutions.org<br>
                📱 +201126522373 / +201155253886
            </small>
        </div>
    `;
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        window.logout();
    }
}

// Auto-apply navigation and footer on page load
document.addEventListener('DOMContentLoaded', () => {
    // Apply navigation if sidebar nav exists
    const navContainer = document.querySelector('.sidebar nav');
    if (navContainer && typeof window.currentPage !== 'undefined') {
        navContainer.innerHTML = renderNavigation(window.currentPage);
    }

    // Apply footer if sidebar exists
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        // Remove old footer if exists
        const oldFooter = sidebar.querySelector('.sidebar-footer');
        if (oldFooter) oldFooter.remove();

        // Add new footer
        sidebar.innerHTML += renderFooter();
    }
});
