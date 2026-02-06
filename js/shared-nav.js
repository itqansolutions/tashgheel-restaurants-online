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
        { page: 'pos', label: 'POS', icon: 'point_of_sale', href: 'pos.html', key: 'nav_pos' },
        { page: 'menu', label: 'Menu Items', icon: 'menu_book', href: 'products.html', key: 'nav_products' },
        { page: 'inventory', label: 'Inventory', icon: 'inventory_2', href: 'inventory.html', key: 'nav_inventory' },
        { page: 'customers', label: t.customers, icon: 'group', href: 'customers.html', key: 'nav_customers' },
        { page: 'kitchen', label: 'Kitchen', icon: 'countertops', href: 'kitchen.html', key: 'nav_kitchen' },
        { page: 'receipts', label: t.receipts, icon: 'receipt_long', href: 'receipts.html', key: 'nav_receipts' },
        { page: 'reports', label: t.reports, icon: 'assessment', href: 'reports.html', key: 'nav_reports' },
        { page: 'vendors', label: t.vendors, icon: 'store', href: 'vendors.html', key: 'nav_vendors' },
        { page: 'expenses', label: t.expenses, icon: 'payments', href: 'expenses.html', key: 'nav_expenses' },
        { page: 'salesmen', label: t.employees, icon: 'badge', href: 'salesmen.html', key: 'nav_employees' },
        { page: 'admin', label: t.admin_panel, icon: 'settings', href: 'admin.html', key: 'nav_admin' }
    ];

    let navHTML = '';
    navItems.forEach(item => {
        const isActive = activePage === item.page;
        const activeClass = isActive
            ? 'bg-slate-800 border-l-4 border-blue-500 text-white'
            : 'text-slate-400 hover:text-white hover:bg-slate-800 transition-colors';

        navHTML += `
        <a class="flex items-center gap-3 px-6 py-3 ${activeClass}" href="${item.href}">
            <span class="material-symbols-outlined text-xl">${item.icon}</span>
            <span class="text-sm font-medium" data-i18n-key="${item.key}">${item.label}</span>
        </a>
        `;
    });

    // Logout Button (Standard)
    navHTML += `
    <button onclick="confirmLogout()" class="w-full flex items-center gap-3 px-6 py-3 text-red-400 hover:text-red-300 hover:bg-slate-800 transition-colors text-left hidden">
        <span class="material-symbols-outlined text-xl">logout</span>
        <span class="text-sm font-medium" data-i18n-key="logout">${t.logout}</span>
    </button>
    `;

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

window.confirmLogout = function () {
    const lang = localStorage.getItem('pos_language') || 'en';
    const t = lang === 'ar' ? 'هل أنت متأكد من تسجيل الخروج؟' : 'Are you sure you want to logout?';

    if (confirm(t)) {
        if (window.logout) window.logout();
        else window.location.href = 'index.html';
    }
};

// Auto-apply navigation and footer on page load
document.addEventListener('DOMContentLoaded', () => {
    // Apply navigation if sidebar nav exists
    const navContainer = document.querySelector('.sidebar nav');
    if (navContainer && typeof window.currentPage !== 'undefined') {
        navContainer.innerHTML = renderNavigation(window.currentPage);
    } else {
        // Fallback for pages where .sidebar nav might be just <nav> inside aside
        const plainNav = document.querySelector('aside nav');
        if (plainNav && typeof window.currentPage !== 'undefined') {
            plainNav.innerHTML = renderNavigation(window.currentPage);
        }
    }

    // Apply footer if sidebar exists
    const sidebar = document.querySelector('.sidebar') || document.querySelector('aside');
    if (sidebar) {
        // Remove old footer if exists
        const oldFooter = sidebar.querySelector('.sidebar-footer');
        if (oldFooter) oldFooter.remove();

        // Add new footer
        sidebar.innerHTML += renderFooter();
    }

    setupMobileNav();
});

function setupMobileNav() {
    // 1. Check if sidebar exists
    const sidebar = document.querySelector('aside');
    if (!sidebar) return;

    // 2. Ensure Sidebar has ID
    if (!sidebar.id) sidebar.id = 'sidebar';

    // 3. Inject Mobile Overlay if missing
    if (!document.getElementById('mobile-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'mobile-overlay';
        overlay.className = 'fixed inset-0 bg-black/50 z-30 hidden lg:hidden glass transition-opacity';
        overlay.onclick = toggleSidebar;
        document.body.appendChild(overlay);
    }

    // 4. Create Toggle Function globally
    window.toggleSidebar = function () {
        const s = document.getElementById('sidebar');
        const o = document.getElementById('mobile-overlay');
        const isClosed = s.classList.contains('-translate-x-full');

        if (isClosed) {
            s.classList.remove('-translate-x-full');
            o.classList.remove('hidden');
        } else {
            s.classList.add('-translate-x-full');
            o.classList.add('hidden');
        }
    }
}

