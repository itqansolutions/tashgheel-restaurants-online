/**
 * Shared Navigation and Footer Component
 * Include this in all pages for consistent UI
 */

const navigationTranslations = {
    en: {
        pos: 'Point of Sale',
        menu_items: 'Menu Items',
        inventory: 'Inventory',
        kitchen: 'Kitchen',
        online_ordering: 'Online Ordering',
        service_visits: 'Service Visits',
        vendors: 'Vendors',
        customers: 'Customers',
        spare_parts: 'Spare Parts',
        receipts: 'Receipts',
        reports: 'Reports',
        employees: 'Employees',
        expenses: 'Expenses',
        admin_panel: 'Admin Panel',
        backup: 'Backup',
        logout: 'Logout'
    },
    ar: {
        pos: 'نقطة البيع',
        menu_items: 'قائمة الطعام',
        inventory: 'المخزون',
        kitchen: 'المطبخ',
        online_ordering: 'الطلبات الأونلاين',
        service_visits: 'زيارات الصيانة',
        vendors: 'الموردين',
        customers: 'العملاء',
        spare_parts: 'قطع الغيار',
        receipts: 'الفواتير',
        reports: 'التقارير',
        employees: 'الموظفين',
        expenses: 'المصاريف',
        admin_panel: 'لوحة التحكم',
        backup: 'النسخ الاحتياطي',
        logout: 'تسجيل الخروج'
    }
};

function renderNavigation(activePage) {
    const lang = localStorage.getItem('pos_language') || 'en';
    const t = navigationTranslations[lang];

    const navItems = [
        { page: 'pos', label: t.pos, icon: 'point_of_sale', href: 'pos.html', key: 'nav_pos' },
        { page: 'menu', label: t.menu_items, icon: 'menu_book', href: 'products.html', key: 'nav_products' },
        { page: 'inventory', label: t.inventory, icon: 'inventory_2', href: 'inventory.html', key: 'nav_inventory' },
        { page: 'customers', label: t.customers, icon: 'group', href: 'customers.html', key: 'nav_customers' },
        { page: 'kitchen', label: t.kitchen, icon: 'countertops', href: 'kitchen.html', key: 'nav_kitchen' },
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
    <button onclick="confirmLogout()" class="w-full flex items-center gap-3 px-6 py-3 text-red-400 hover:text-red-300 hover:bg-slate-800 transition-colors text-left">
        <span class="material-symbols-outlined text-xl">logout</span>
        <span class="text-sm font-medium" data-i18n-key="logout">${t.logout}</span>
    </button>
    `;

    return navHTML;
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
    // Apply navigation
    // Priority: .sidebar nav (if specific structure), else aside nav, else aside .nav-container
    const navContainer = document.querySelector('.sidebar nav') || document.querySelector('aside nav') || document.querySelector('#dynamic-nav');

    if (navContainer && typeof window.currentPage !== 'undefined') {
        navContainer.innerHTML = renderNavigation(window.currentPage);
    }

    // Inject Custom Scrollbar Styles Globally
    if (!document.getElementById('scrollbar-styles')) {
        const style = document.createElement('style');
        style.id = 'scrollbar-styles';
        style.textContent = `
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        `;
        document.head.appendChild(style);
    }

    setupMobileNav();
});

// Listen for Language Changes to re-render sidebar
window.addEventListener('languageChanged', (e) => {
    // Re-render navigation
    const navContainer = document.querySelector('.sidebar nav') || document.querySelector('aside nav') || document.querySelector('#dynamic-nav');
    if (navContainer && typeof window.currentPage !== 'undefined') {
        navContainer.innerHTML = renderNavigation(window.currentPage);
    }
    // Re-render footer if exists (not implemented yet but good practice)
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
    // 4. Create Toggle Function globally
    window.toggleSidebar = function () {
        const s = document.getElementById('sidebar');
        const o = document.getElementById('mobile-overlay');
        if (!s || !o) return; // Safeguard

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
// Ensure it's available even if setupMobileNav hasn't run yet (failsafe)
window.toggleSidebar = window.toggleSidebar || function () { console.warn('Sidebar not ready'); };

