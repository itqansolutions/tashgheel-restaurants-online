/**
 * Customer & Address Management Logic
 * Uses db.js and EnhancedSecurity
 * Refactored for Restaurant Context (Delivery)
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

// customers-app.js
window.currentPage = 'customers';
document.addEventListener('DOMContentLoaded', async () => {
    // Init Security (Load Data)
    // EnhancedSecurity.init() is now auto-handled by auth.js

    // REMOVED: Legacy session check - auth.js handles this via cookies
    // if (!window.isSessionValid()) {
    //     window.location.href = 'index.html';
    //     return;
    // }

    // User Info
    const user = window.getCurrentUser();
    if (user) {
        document.getElementById('currentUserName').textContent = user.fullName;
        document.getElementById('userRole').textContent = user.role;
    }

    // Initial Load
    renderApp();

    // Re-render when language changes
    window.addEventListener('languageChanged', () => {
        renderApp();
    });
});

// === RENDER ===
function renderApp() {
    const container = document.getElementById('customersContainer');
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();

    container.innerHTML = '';

    let customers = window.DB.getCustomers();

    // Filter
    if (searchTerm) {
        customers = customers.filter(c => {
            const matchName = c.name.toLowerCase().includes(searchTerm);
            const matchMobile = c.mobile.includes(searchTerm);
            return matchName || matchMobile;
        });
    }

    // Sort newest first
    customers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (customers.length === 0) {
        container.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#666;">${t('No customers found.', 'لا يوجد عملاء.')}</p>`;
        return;
    }

    customers.forEach(c => {
        // Find Primary Address (or first)
        const addressCount = c.addresses ? c.addresses.length : 0;
        let mainAddr = null;
        if (addressCount > 0) {
            mainAddr = c.addresses[0];
        }

        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group';

        card.innerHTML = `
            <div class="px-5 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-slate-800 text-lg">${c.name}</h3>
                    <div class="flex items-center gap-2 text-slate-500 text-sm mt-1">
                        <span class="material-symbols-outlined text-[16px]">smartphone</span> 
                        <span>${c.mobile}</span>
                    </div>
                </div>
                <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold">
                    ${c.name.charAt(0).toUpperCase()}
                </div>
            </div>
            
            <div class="p-5 flex-1 space-y-3">
                ${c.notes ? `
                <div class="bg-amber-50 text-amber-800 px-3 py-2 rounded-lg text-xs font-medium flex items-start gap-2 border border-amber-100">
                   <span class="material-symbols-outlined text-[16px] text-amber-500">warning</span>
                   <span>${c.notes}</span>
                </div>` : ''}

                <div class="flex items-start gap-3">
                   <span class="material-symbols-outlined text-slate-400 mt-0.5">location_on</span>
                   <div class="text-sm">
                       ${addressCount > 0 ?
                `<span class="font-semibold text-slate-700 block">${mainAddr.area}</span>
                          <span class="text-slate-500 leading-tight block mt-0.5">${mainAddr.street || ''}</span>
                         `
                : '<span class="text-slate-400 italic">No address saved</span>'}
                   </div>
                </div>

                ${addressCount > 1 ? `
                  <div class="pl-8">
                    <span class="inline-block bg-blue-50 text-blue-600 px-2 py-1 rounded text-[10px] font-bold tracking-wide uppercase border border-blue-100">+ ${addressCount - 1} more locations</span>
                  </div>
                ` : ''}
            </div>

            <div class="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-2">
                <button class="flex-1 flex items-center justify-center gap-2 py-2 bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-slate-600 hover:text-blue-700 rounded-lg text-sm font-medium transition-colors shadow-sm" onclick="openDetails(${c.id})">
                  <span class="material-symbols-outlined text-[18px]">visibility</span> 
                  <span>${t('Details', 'التفاصيل')}</span>
                </button>
                <button class="w-10 h-auto flex items-center justify-center bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-400 hover:text-red-600 rounded-lg transition-colors shadow-sm" onclick="deleteCustomer(${c.id})">
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// === AREAS MANAGEMENT ===
function openAreasModal() {
    document.getElementById('newAreaName').value = '';
    document.getElementById('newAreaFee').value = '';
    renderAreasList();
    document.getElementById('areasModal').style.display = 'flex';
}

function renderAreasList() {
    const list = document.getElementById('areasList');
    list.innerHTML = '';
    const areas = window.DB.getDeliveryAreas();

    if (areas.length === 0) {
        list.innerHTML = '<div class="p-4 text-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">No areas defined.</div>';
        return;
    }

    areas.forEach(a => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2 group hover:border-blue-200 transition-colors';

        item.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <span class="material-symbols-outlined text-sm">map</span>
                </div>
                <div>
                    <div class="font-bold text-slate-700 text-sm">${a.name}</div>
                    <div class="text-xs text-slate-500 font-medium">Fee: ${parseFloat(a.fee).toFixed(2)}</div>
                </div>
            </div>
            <button class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" onclick="deleteArea(${a.id})">
                <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
        `;
        list.appendChild(item);
    });
}

function saveNewArea() {
    const name = document.getElementById('newAreaName').value.trim();
    const fee = parseFloat(document.getElementById('newAreaFee').value);

    if (!name || isNaN(fee)) {
        alert('Enter valid Name and Fee');
        return;
    }

    window.DB.saveDeliveryArea({ id: Date.now(), name, fee });
    document.getElementById('newAreaName').value = '';
    document.getElementById('newAreaFee').value = '';
    renderAreasList();
}

function deleteArea(id) {
    if (confirm('Delete this area?')) {
        window.DB.deleteDeliveryArea(id);
        renderAreasList();
    }
}

function populateAreaSelects() {
    const areas = window.DB.getDeliveryAreas();
    const selects = ['initArea', 'vArea'];

    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // Keep first option (Select Area)
        el.innerHTML = '<option value="">-- Select Area --</option>';

        areas.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.name; // Storing Name to be compatible with display
            opt.dataset.fee = a.fee;
            opt.textContent = `${a.name} - ${a.fee}`;
            el.appendChild(opt);
        });
    });
}


// === CUSTOMER CRUD ===
function openAddCustomerModal() {
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
    document.getElementById('modalTitle').textContent = t('Add Customer', 'إضافة عميل');

    // Populate Areas
    populateAreaSelects();

    // Reset initial address fields
    ['initStreet', 'initBuilding', 'initFloor', 'initApt', 'initExtra'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('initArea').value = '';

    document.getElementById('customerModal').style.display = 'flex';
}

function handleCustomerSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('customerId').value; // if empty, new
    const name = document.getElementById('custName').value.trim();
    const mobile = document.getElementById('custMobile').value.trim();
    const notes = document.getElementById('custNotes').value.trim();

    let customer = {};
    if (id) {
        // Update existing
        const existing = window.DB.getCustomers().find(c => c.id == id);
        if (existing) {
            customer = { ...existing, name, mobile, notes };
        }
    } else {
        // New
        customer = {
            id: Date.now(),
            name,
            mobile,
            notes,
            addresses: []
        };

        // Check for initial address
        const initArea = document.getElementById('initArea').value.trim();
        const initStreet = document.getElementById('initStreet').value.trim();

        if (initArea || initStreet) {
            customer.addresses.push({
                id: Date.now() + 1,
                area: initArea,
                street: initStreet,
                building: document.getElementById('initBuilding').value.trim(),
                floor: document.getElementById('initFloor').value.trim(),
                apt: document.getElementById('initApt').value.trim(),
                extra: document.getElementById('initExtra').value.trim()
            });
        }
    }

    window.DB.saveCustomer(customer);
    renderApp();
    closeModal('customerModal');

    // If it was an update, might need to refresh details view if open
    if (id && currentCustomerIdForDetails == id) {
        openDetails(parseInt(id));
    }
}

function deleteCustomer(id) {
    if (confirm(t('delete_customer_confirm'))) {
        window.DB.deleteCustomer(id);
        renderApp();
    }
}

// === DETAILS & ADDRESSES ===
let currentCustomerIdForDetails = null;

function openDetails(customerId) {
    currentCustomerIdForDetails = customerId;
    const customers = window.DB.getCustomers();
    const c = customers.find(x => x.id === customerId);
    if (!c) return;

    // Show Customer Info
    const infoDiv = document.getElementById('customerInfoDisplay');
    infoDiv.innerHTML = `
        <h2 style="margin:0;">${c.name}</h2>
        <p>📱 ${c.mobile}</p>
        <p>📝 ${c.notes || 'No notes'}</p>
    `;

    renderAddressesList(c);

    document.getElementById('detailsModal').style.display = 'flex';
}

function renderAddressesList(customer) {
    const list = document.getElementById('addressesList');
    list.innerHTML = '';

    const addresses = customer.addresses || [];

    if (addresses.length === 0) {
        list.innerHTML = `<p style="color:#777;">${t('No addresses registered.', 'لا يوجد عناوين مسجلة.')}</p>`;
        return;
    }

    addresses.forEach((addr, index) => {
        const item = document.createElement('div');
        item.className = 'vehicle-list-item'; // Reuse class for styling
        item.style.marginBottom = '10px';
        item.innerHTML = `
            <div class="vehicle-header">
                <span>📍 ${addr.area} - ${addr.street}</span>
                <button class="btn btn-sm btn-danger" onclick="deleteAddress(${index})" style="padding:1px 6px;">x</button>
            </div>
            <div style="font-size:0.9em;color:#555;margin-top:5px;">
                <div>Building: ${addr.building || '-'}, Floor: ${addr.floor || '-'}, Apt: ${addr.apt || '-'}</div>
                ${addr.extra ? `<div>Info: ${addr.extra}</div>` : ''}
            </div>
        `;
        list.appendChild(item);
    });
}

// === ADDRESS CRUD ===
function openAddAddressModal() {
    document.getElementById('addressForm').reset();
    document.getElementById('addrCustomerId').value = currentCustomerIdForDetails;

    populateAreaSelects();

    document.getElementById('addressModal').style.display = 'flex';
}

function handleAddressSubmit(e) {
    e.preventDefault();
    const customerId = parseInt(document.getElementById('addrCustomerId').value);

    const addr = {
        area: document.getElementById('vArea').value.trim(),
        street: document.getElementById('vStreet').value.trim(),
        building: document.getElementById('vBuilding').value.trim(),
        floor: document.getElementById('vFloor').value.trim(),
        apt: document.getElementById('vApt').value.trim(),
        extra: document.getElementById('vLandmark').value.trim(),
        id: Date.now()
    };

    const customers = window.DB.getCustomers();
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
        if (!customer.addresses) customer.addresses = [];
        customer.addresses.push(addr);
        window.DB.saveCustomer(customer);

        renderAddressesList(customer);
        renderApp(); // Update main grid count
    }

    closeModal('addressModal');
}

function deleteAddress(index) {
    if (!confirm(t('confirm_delete', 'Are you sure?'))) return;

    const customers = window.DB.getCustomers();
    const customer = customers.find(c => c.id === currentCustomerIdForDetails);
    if (customer && customer.addresses) {
        customer.addresses.splice(index, 1);
        window.DB.saveCustomer(customer);
        renderAddressesList(customer);
        renderApp();
    }
}

// === UTILS ===
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function confirmLogout() {
    if (confirm(t('confirm_logout'))) {
        window.logout();
        window.location.href = 'index.html';
    }
}
