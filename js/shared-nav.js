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
        dine_in: 'Dine-In Tables',
        tables_mgmt: 'Tables Setup',
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
        dine_in: 'طلبات الطاولات',
        tables_mgmt: 'إعدادات الطاولات',
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
        { page: 'dinein', label: t.dine_in, icon: 'table_restaurant', href: 'dine-in.html', key: 'nav_dinein' },
        { page: 'tables', label: t.tables_mgmt, icon: 'chair', href: 'tables.html', key: 'nav_tables' },
        { page: 'receipts', label: t.receipts, icon: 'receipt_long', href: 'receipts.html', key: 'nav_receipts' },
        { page: 'reports', label: t.reports, icon: 'assessment', href: 'reports.html', key: 'nav_reports' },
        { page: 'vendors', label: t.vendors, icon: 'store', href: 'vendors.html', key: 'nav_vendors' },
        { page: 'expenses', label: t.expenses, icon: 'payments', href: 'expenses.html', key: 'nav_expenses' },
        { page: 'salesmen', label: t.employees, icon: 'badge', href: 'salesmen.html', key: 'nav_employees' },
        { page: 'admin', label: t.admin_panel, icon: 'settings', href: 'admin.html', key: 'nav_admin' }
    ];

    // Check feature flags from shop settings
    let kitchenEnabled = true;
    let dineInEnabled = true;
    try {
        const shopSettings = window.EnhancedSecurity?.getSecureData('shop_settings');
        if (shopSettings) {
            if (shopSettings.enableKitchen === false) kitchenEnabled = false;
            if (shopSettings.enableDineIn === false) dineInEnabled = false;
        }
    } catch (e) { /* keep defaults */ }

    let navHTML = '';
    navItems.forEach(item => {
        // Respect feature flags
        if (item.page === 'kitchen' && !kitchenEnabled) return;
        if ((item.page === 'dinein' || item.page === 'tables') && !dineInEnabled) return;

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

// ===================== GLOBAL MANAGER PIN OVERRIDE SYSTEM =====================
let _pinCallback = null;
let _pinCancelCallback = null;

function _buildPinNumpad() {
    const numpad = document.getElementById('pin-numpad');
    if (!numpad || numpad.children.length > 0) return;
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'];
    keys.forEach(k => {
        const btn = document.createElement('button');
        btn.textContent = k;
        btn.style.cssText = `padding:13px 0; background:#0f172a; border:1.5px solid #334155; border-radius:10px; color:${k === '' ? 'transparent' : '#f1f5f9'}; font-size:18px; font-weight:700; cursor:${k === '' ? 'default' : 'pointer'};`;
        if (k !== '') {
            btn.onmousedown = () => btn.style.background = '#1e3a5f';
            btn.onmouseup = () => btn.style.background = '#0f172a';
            if (k === '⌫') {
                btn.onclick = () => { const inp = document.getElementById('pin-entry-input'); inp.value = inp.value.slice(0, -1); };
            } else {
                btn.onclick = () => { const inp = document.getElementById('pin-entry-input'); if (inp.value.length < 8) inp.value += k; };
            }
        }
        numpad.appendChild(btn);
    });
}

function injectManagerPinModal() {
    if (document.getElementById('managerPinModal')) return;

    const modal = document.createElement('div');
    modal.id = 'managerPinModal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.65); align-items:center; justify-content:center;';
    modal.innerHTML = `
    <div style="background:#1e293b; border:1px solid #334155; border-radius:20px; padding:28px; width:300px; max-width:92vw; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.5); font-family: sans-serif;">
      <div style="font-size:32px; margin-bottom:6px;">🔒</div>
      <h3 style="color:#f1f5f9; font-weight:700; font-size:16px; margin-bottom:4px;">Manager Authorization</h3>
      <p id="pin-action-label" style="color:#94a3b8; font-size:12px; margin-bottom:18px;">Enter manager PIN to continue</p>
      <input id="pin-entry-input" type="password" maxlength="8" autocomplete="off"
        style="width:100%; box-sizing:border-box; background:#0f172a; border:2px solid #334155; border-radius:12px; padding:12px 16px; color:#f1f5f9; font-size:24px; letter-spacing:10px; text-align:center; outline:none; margin-bottom:16px;"
        onkeydown="if(event.key==='Enter') confirmManagerPin()">
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px;" id="pin-numpad"></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <button onclick="confirmManagerPin()"
          style="padding:12px; background:#d97706; border:none; border-radius:12px; color:#fff; font-weight:700; cursor:pointer;">
          ✓ Confirm
        </button>
        <button onclick="cancelManagerPin()"
          style="padding:12px; background:#334155; border:none; border-radius:12px; color:#94a3b8; font-weight:700; cursor:pointer;">
          Cancel
        </button>
      </div>
      <p id="pin-error-msg" style="color:#ef4444; font-size:12px; margin-top:10px; min-height:16px;"></p>
    </div>
    `;
    document.body.appendChild(modal);
}

window.requireManagerPin = function(actionLabel, onSuccess, onCancel) {
    const settings = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    if (!settings.managerPin) {
        onSuccess();
        return;
    }
    injectManagerPinModal();
    _pinCallback = onSuccess;
    _pinCancelCallback = onCancel || null;
    const modal = document.getElementById('managerPinModal');
    const label = document.getElementById('pin-action-label');
    const input = document.getElementById('pin-entry-input');
    const errEl = document.getElementById('pin-error-msg');
    if (label) label.textContent = actionLabel || 'Enter manager PIN to continue';
    if (input) input.value = '';
    if (errEl) errEl.textContent = '';
    _buildPinNumpad();
    if (modal) modal.style.display = 'flex';
    setTimeout(() => input?.focus(), 100);
};

window.confirmManagerPin = function () {
    const settings = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const entered = document.getElementById('pin-entry-input')?.value || '';
    const errEl = document.getElementById('pin-error-msg');
    if (entered === settings.managerPin) {
        document.getElementById('managerPinModal').style.display = 'none';
        if (_pinCallback) { _pinCallback(); _pinCallback = null; }
    } else {
        if (errEl) errEl.textContent = '❌ Incorrect PIN. Try again.';
        const input = document.getElementById('pin-entry-input');
        if (input) input.value = '';
    }
};

window.cancelManagerPin = function () {
    document.getElementById('managerPinModal').style.display = 'none';
    const input = document.getElementById('pin-entry-input');
    if (input) input.value = '';
    if (_pinCancelCallback) { _pinCancelCallback(); _pinCancelCallback = null; }
    _pinCallback = null;
};

// Ensure modal injected on load
document.addEventListener('DOMContentLoaded', () => {
    injectManagerPinModal();
});

