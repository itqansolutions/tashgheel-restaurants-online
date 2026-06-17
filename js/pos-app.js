// POS JS with salesman support and fixed receipt printing (final version)
// ===================== MOBILE UI LOGIC =====================
window.toggleCart = function () {
  const cart = document.getElementById('cartSidebar');
  if (!cart) return;

  if (cart.classList.contains('hidden')) {
    // Open on Mobile
    cart.classList.remove('hidden');
    cart.classList.add('fixed', 'inset-0', 'w-full', 'h-full');
    // Ensure it doesn't conflict with desktop styles if resized
  } else {
    // Close on Mobile
    cart.classList.add('hidden');
    cart.classList.remove('fixed', 'inset-0', 'w-full', 'h-full');
  }
};
let allProducts = [];
let filteredProducts = [];
let cart = [];
let currentDiscountIndex = null;
let currentShift = null;
let currentOnlineOrderId = null;
let currentDineInOrder = null;
let currentGrandTotal = 0;

// Translation Helper using global translations
const t = (key) => {
  const lang = localStorage.getItem('pos_language') || 'en';
  if (window.translations && window.translations[key]) {
    return window.translations[key][lang];
  }
  return key; // Fallback to key if not found
};

// ===================== INIT =====================// pos-app.js
window.currentPage = 'pos';
document.addEventListener("DOMContentLoaded", async () => {
  // EnhancedSecurity.init() is now auto-handled by auth.js

  loadProducts();
  loadSalesmen();

  // Bind search once
  bindSearchOnce();
  ensureSearchClickable();

  window.addEventListener("pageshow", () => {
    bindSearchOnce();
    ensureSearchClickable();
    loadProducts();
    const q = document.getElementById("productSearch")?.value?.trim();
    if (q) handleSearch();
  });

  document.getElementById("productSearch")?.addEventListener("input", handleSearch);
  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "productSearch") handleSearch();
  });

  document.getElementById("closeDayBtn")?.addEventListener("click", printDailySummary);

  // Listen for language change to update dynamic content
  window.addEventListener('languageChanged', () => {
    renderProducts();
    updateCartDisplay();
    loadSalesmen(); // In case we want to translate 'Select Salesman' default option
  });

  updateCartSummary();
  loadTables();
  // 🚀 Shift Check (Mandatory for SaaS)
  checkShift();

  // 👤 Update Username Display
  if (window.getCurrentUser) {
    const user = window.getCurrentUser();
    if (user && user.username) {
      const nameEl = document.getElementById('currentUserName');
      if (nameEl) nameEl.textContent = user.username;
    }
  }

  // ☁️ Online Orders Polling
  setInterval(fetchOnlineOrders, 30000);
  fetchOnlineOrders();
});

function bindSearchOnce() {
  const el = document.getElementById("productSearch");
  if (el && !el.dataset.bound) {
    el.addEventListener("input", handleSearch);
    el.dataset.bound = "1";
  }
}

function ensureSearchClickable() {
  const el = document.getElementById("productSearch");
  if (el) {
    el.style.pointerEvents = "auto";
    el.style.position = "relative";
    el.style.zIndex = "1000";
    ["discountModal", "auditModal"].forEach(id => {
      const m = document.getElementById(id);
      if (m && getComputedStyle(m).display !== "none") {
        m.style.display = "none";
      }
    });
    el.addEventListener("mousedown", () => el.focus(), { once: true });
  }
}

// ===================== LOAD PRODUCTS =====================

// Exposed for HTML access
window.closeDay = function () {
  const modal = document.getElementById('closeDayModal');
  if (modal) modal.style.display = 'flex';
};

// ===================== SHIFT MANAGEMENT =====================

window.promptOpenShift = function() {
  document.getElementById('openShiftModal').style.display = 'flex';
};

async function checkShift() {
  // 🔒 Kitchen Role Restriction
  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || localStorage.getItem('role');
  if (userRole === 'kitchen') {
    window.location.href = 'kitchen.html';
    return;
  }

  const result = await window.electronAPI.getCurrentShift();

  if (result && result.error === 'BRANCH_REQUIRED') {
    console.warn('Branch selection missing. Redirecting...');
    localStorage.removeItem('activeBranchId'); // Clear any toxic string like "null"
    window.location.href = 'index.html';
    return;
  }

  if (result && result.shift) {
    currentShift = result.shift;
    updateShiftUI();
  } else {
    // If user is admin, allow bypass (do not show openShiftModal/joinShift prompting)
    if (userRole === 'admin') {
      console.log('👑 Admin detected: bypassing shift requirement (viewing mode)');
      
      const banner = document.getElementById('shiftBanner');
      if (banner) {
        if (!window.originalShiftBannerHTML) {
          window.originalShiftBannerHTML = banner.innerHTML;
        }
        banner.innerHTML = `
          <div class="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 font-bold text-xs">
            <span class="material-symbols-outlined text-sm">visibility</span>
            <span>Viewing Mode</span>
            <button type="button" onclick="promptOpenShift()" class="px-2 py-0.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-[10px] font-bold transition-colors ml-1">Open Shift</button>
          </div>
        `;
        banner.style.display = 'block';
      }
      return;
    }

    // Check for ANY active shifts in this branch (for Join functionality)
    if (window.electronAPI.getActiveBranchShifts) {
      const activeShifts = await window.electronAPI.getActiveBranchShifts();
      if (activeShifts && activeShifts.length > 0) {
        promptDiffShift(activeShifts);
      } else {
        document.getElementById('openShiftModal').style.display = 'flex';
      }
    } else {
      document.getElementById('openShiftModal').style.display = 'flex';
    }
  }
}

function promptDiffShift(activeShifts) {
  const modal = document.getElementById('openShiftModal');
  const content = modal.querySelector('.bg-white');

  if (!modal.dataset.original) modal.dataset.original = content.innerHTML;

  let html = `
    <div class="text-center">
        <div class="flex justify-center mb-4">
            <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                 <span class="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400">group_add</span>
            </div>
        </div>
        <h2 class="text-2xl font-bold mb-2 dark:text-white" data-i18n-key="active_shifts_found">Active Shifts Found</h2>
        <p class="text-slate-500 mb-6" data-i18n-key="join_shift_desc">There are active shifts in this branch. You can join one or start a new one.</p>
        <div class="space-y-3 mb-6 max-h-[200px] overflow-y-auto">
            ${activeShifts.map(s => `
                <button onclick="joinExistingShift('${s.id || s._id}')" 
                    class="w-full flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            <span class="material-symbols-outlined text-sm">person</span>
                        </div>
                        <div class="text-left">
                            <div class="font-bold text-sm dark:text-white">${s.cashierId?.fullName || 'Cashier'}</div>
                            <div class="text-[10px] text-slate-500">Opened: ${new Date(s.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                    </div>
                    <span class="text-blue-600 font-bold text-sm" data-i18n-key="join">Join</span>
                </button>
            `).join('')}
        </div>

        <div class="flex flex-col gap-3">
             <button onclick="restoreOpenShiftModal()" class="w-full py-3 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                <span data-i18n-key="start_new_shift">Start New Shift Instead</span>
             </button>
        </div>
    </div>
    `;

  content.innerHTML = html;
  modal.style.display = 'flex';
}

window.restoreOpenShiftModal = function () {
  const modal = document.getElementById('openShiftModal');
  if (modal.dataset.original) {
    modal.querySelector('.bg-white').innerHTML = modal.dataset.original;
  }
}

window.joinExistingShift = async function (shiftId) {
  if (!confirm('Join this shift?')) return;

  const result = await window.electronAPI.joinShift(shiftId);
  if (result && result.success) {
    currentShift = result.shift;
    document.getElementById('openShiftModal').style.display = 'none';
    updateShiftUI();
  } else {
    alert(result?.error || 'Failed to join shift');
  }
}

function updateShiftUI() {
  if (!currentShift) return;

  const banner = document.getElementById('shiftBanner');
  if (banner && window.originalShiftBannerHTML) {
    banner.innerHTML = window.originalShiftBannerHTML;
  }

  const timeEl = document.getElementById('shiftOpenTime');
  const cashEl = document.getElementById('shiftCashDisplay');

  if (banner) banner.style.display = 'block';
  if (timeEl) {
    const d = new Date(currentShift.openedAt);
    timeEl.textContent = `Opened: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  updateShiftCashDisplay();
}

function updateShiftCashDisplay() {
  const cashEl = document.getElementById('shiftCashDisplay');
  if (cashEl && currentShift) {
    // Note: This is an estimated running total, backend is source of truth on close
    // We can fetch live stats if needed, but for now showing opening cash
    cashEl.textContent = `${currentShift.openingCash.toFixed(2)} ${t('currency') || 'EGP'} (${t('base_cash') || 'Base'})`;
  }
}

async function confirmOpenShift() {
  const openingCash = parseFloat(document.getElementById('openingCashInput').value || 0);
  const result = await window.electronAPI.openShift(openingCash);

  if (result && result.success) {
    currentShift = result.shift;
    document.getElementById('openShiftModal').style.display = 'none';
    updateShiftUI();
  } else {
    alert(result?.error || 'Failed to open shift');
  }
}

async function closeShiftFlow() {
  if (!currentShift) return;

  // Fetch latest stats for this shift before showing modal
  // For simplicity, we can let the close API handle aggregation, 
  // but to show "Expected" in the UI, we need a quick fetch.
  const statsResult = await window.electronAPI.getCurrentShift(); // Refresh instance
  if (!statsResult?.shift) return;

  const s = statsResult.shift;
  document.getElementById('statOpeningCash').textContent = s.openingCash.toFixed(2);

  // We'll calculate Expected based on current session if available, 
  // or add a 'getShiftStats' endpoint. For now, we'll use a placeholder or zero.
  // IDEAL: Backend should provide 'currentTotals' in getCurrentShift()
  const cashSales = s.totals?.cashTotal || 0;
  document.getElementById('statNetSales').textContent = cashSales.toFixed(2);

  const expected = s.openingCash + cashSales;
  document.getElementById('statExpectedCash').textContent = `${expected.toFixed(2)} ${t('currency') || 'EGP'}`;

  document.getElementById('closeShiftModal').style.display = 'flex';
  document.getElementById('closingCashInput').value = '';
  document.getElementById('diffHighlight').style.display = 'none';
}

function calculateShiftDiff() {
  const expectedText = document.getElementById('statExpectedCash').textContent;
  const expected = parseFloat(expectedText.replace(/[^0-9.]/g, ''));
  const actual = parseFloat(document.getElementById('closingCashInput').value || 0);

  const diff = actual - expected;
  const diffEl = document.getElementById('statDiff');
  const highlight = document.getElementById('diffHighlight');

  diffEl.textContent = `${diff.toFixed(2)} ${t('currency')}`;
  highlight.style.display = 'block';

  if (diff === 0) {
    highlight.style.background = '#e8f5e9';
    highlight.style.color = '#2e7d32';
  } else if (diff > 0) {
    highlight.style.background = '#e3f2fd';
    highlight.style.color = '#1565c0';
    diffEl.textContent = `+${diff.toFixed(2)} ${t('currency')} (${t('overage')})`;
  } else {
    highlight.style.background = '#ffebee';
    highlight.style.color = '#c62828';
    diffEl.textContent = `${diff.toFixed(2)} ${t('currency')} (${t('shortage')})`;
  }
}

async function confirmCloseShift() {
  if (!confirm(t('close_shift_confirm'))) return;

  const closingCashInput = document.getElementById('closingCashInput');
  const closingNotesInput = document.getElementById('closingNotesInput');

  const closingCash = parseFloat(closingCashInput?.value || 0);
  const notes = closingNotesInput?.value || "";

  const result = await window.electronAPI.closeShift(currentShift.id || currentShift._id, closingCash, notes);

  if (result && result.success) {
    alert(`${t('shift_closed_success')}${result.shift.difference.toFixed(2)}`);
    // Logout or redirect to branch picker
    localStorage.removeItem('activeBranchId');
    window.location.href = 'index.html';
  } else {
    alert(result?.error || t('failed_close_shift'));
  }
}


let currentCategory = 'All';

function loadProducts() {
  const products = window.DB.getParts(); // Get Menu Items
  allProducts = products;
  renderCategories();
  applyFilters();
}

function renderCategories() {
  const container = document.getElementById('categoryFilterContainer');
  if (!container) return;

  // Get unique categories
  const categories = ['All', ...new Set(allProducts.map(p => p.category).filter(Boolean))];

  container.innerHTML = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    const isActive = currentCategory === cat;
    btn.className = `px-5 py-2 text-xs font-bold rounded-full flex-shrink-0 transition-all border ${isActive
      ? 'bg-primary text-white shadow-lg border-primary'
      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-primary'
      }`;
    btn.textContent = cat === 'All' ? (t('all') || 'All') : cat;
    btn.onclick = () => {
      currentCategory = cat;
      renderCategories(); // Re-render to update active state
      applyFilters();
    };
    container.appendChild(btn);
  });
}

function applyFilters() {
  const q = document.getElementById("productSearch")?.value.toLowerCase().trim() || '';

  filteredProducts = allProducts.filter(p => {
    // 1. Category Filter
    if (currentCategory !== 'All' && p.category !== currentCategory) return false;

    // 2. Search Filter
    if (q) {
      return p.name.toLowerCase().includes(q) || (p.partNumber && p.partNumber.toLowerCase().includes(q));
    }

    return true;
  });

  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const currentLang = localStorage.getItem('pos_language') || 'en';

  if (filteredProducts.length === 0) {
    grid.innerHTML = `<p style="width:100%; text-align:center; color:#666;">${t('no_products_found')}</p>`;
    return;
  }

  filteredProducts.forEach(product => {
    const card = document.createElement("div");
    card.className = "bg-white dark:bg-slate-800 p-2.5 rounded-xl shadow-sm border border-transparent hover:border-primary transition-all group cursor-pointer h-full flex flex-col";
    card.onclick = () => addToCart(product);

    // Determine Price Display
    let priceDisplay = product.price;
    if (product.hasSizes && product.sizes && product.sizes.length > 0) {
      const prices = product.sizes.map(s => s.price);
      const minPrice = Math.min(...prices);
      priceDisplay = `${minPrice}+`; // classic "Starting at" display
    }

    const imgHtml = product.image
      ? `<img src="${product.image}" alt="${product.name}" class="w-full h-full object-cover transition-transform group-hover:scale-105" onerror="this.parentElement.innerHTML='<span class=\\'material-symbols-outlined text-4xl text-slate-300\\'>restaurant</span>'">`
      : `<span class="material-symbols-outlined text-4xl text-slate-300">restaurant</span>`;

    card.innerHTML = `
      <div class="aspect-square bg-slate-100 dark:bg-slate-700 rounded-lg mb-2.5 overflow-hidden flex items-center justify-center relative">
        ${imgHtml}
        ${(product.stock || 0) <= 5 && !product.hasSizes ? `<span class="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Low</span>` : ''}
      </div>
      <div class="px-1 flex-1 flex flex-col justify-between">
        <h3 class="text-xs font-bold mb-1 truncate text-slate-800 dark:text-slate-100 uppercase tracking-tight" title="${product.name}">${product.name}</h3>
        <div class="flex items-center justify-between mt-auto">
          <span class="text-xs font-black text-primary dark:text-slate-400">${product.hasSizes ? priceDisplay : parseFloat(priceDisplay || 0).toFixed(2)}</span>
          <button class="w-7 h-7 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-primary dark:text-slate-200 group-hover:bg-primary group-hover:text-white transition-colors">
            <span class="material-symbols-outlined text-sm font-bold">add</span>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function handleSearch() {
  applyFilters();
}

function searchProductByBarcode(barcode) {
  // 1. Check Main Products
  let product = allProducts.find(p => p.partNumber === barcode);
  if (product) {
    addToCart(product);
    return true;
  }

  // 2. Check Sizes
  // We need to find the product that HAS this size
  for (const p of allProducts) {
    if (p.hasSizes && p.sizes) {
      const size = p.sizes.find(s => s.code === barcode);
      if (size) {
        // Add specific size of this product
        addItemToCartFinal(p, [], size);
        return true;
      }
    }
  }

  return false;
}

// Global Barcode Scanner Event Listener
let barcodeBuffer = '';
let lastKeyTime = 0;

window.addEventListener('keydown', (e) => {
  if (!e || !e.key) return;
  const target = e.target;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
  
  const currentTime = Date.now();
  const isFast = lastKeyTime && (currentTime - lastKeyTime < 40);
  lastKeyTime = currentTime;

  if (e.key === 'Enter') {
    if (barcodeBuffer.length >= 3) {
      const found = searchProductByBarcode(barcodeBuffer);
      if (found) {
        barcodeBuffer = '';
        e.preventDefault();
        e.stopPropagation();
        // Clear active search inputs if they were focused
        if (isInput && (target.id === 'productSearch' || target.id === 'productBarcodeSearch')) {
          target.value = '';
        }
        if (window.showToast) window.showToast('Product scanned successfully!', 'success');
        return;
      }
    }
    barcodeBuffer = '';
  } else if (e.key.length === 1) {
    if (!isInput || isFast) {
      if (isFast || barcodeBuffer === '') {
        barcodeBuffer += e.key;
      } else {
        barcodeBuffer = e.key;
      }
    } else {
      barcodeBuffer = '';
    }
  }
});

// ... (existing code)

// ===================== HELPERS =====================
function loadSalesmen(roleOrRoles) {
  const select = document.getElementById('salesmanSelect');
  if (!select) return;

  // Clear current options
  select.innerHTML = '';

  // Create 'None' or placeholder option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = "";
  defaultOpt.textContent = "-- Select --";
  select.appendChild(defaultOpt);

  // Get Employees from DB
  const employees = window.DB.getEmployees ? window.DB.getEmployees() : [];

  // Filter based on roles
  let validRoles = [];
  if (Array.isArray(roleOrRoles)) {
    validRoles = roleOrRoles.map(r => r.toLowerCase());
  } else if (roleOrRoles) {
    validRoles = [roleOrRoles.toLowerCase()];
  } else {
    // If no roleOrRoles is provided, load all relevant roles
    validRoles = ['salesman', 'manager', 'waiter', 'delivery', 'kiosk', 'chef'];
  }

  const filtered = employees.filter(e => {
    const r = (e.role || '').toLowerCase();
    // Map systematic roles to actual string roles if needed
    if (validRoles.includes('delivery')) {
      if (r.includes('delivery') || r.includes('driver') || r.includes('طيار') || r.includes('توصيل') || r.includes('mo')) return true;
    }
    if (validRoles.includes('waiter')) {
      if (r.includes('waiter') || r.includes('serve') || r.includes('متر') || r.includes('ويتر') || r.includes('sala')) return true;
    }
    // If passing explicit role names
    return validRoles.includes(r);
  });

  filtered.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.name;
    opt.textContent = u.name;
    select.appendChild(opt);
  });
}

async function loadTables() {
  const select = document.getElementById("tableSelect");
  if (!select) return;
  select.innerHTML = `<option value="">-- ${t('select_table') || 'Select Table'} --</option>`;
  try {
    const tables = await window.apiFetch('/tables') || [];
    tables.forEach(table => {
      const opt = document.createElement("option");
      opt.value = table.id || table._id;
      opt.textContent = table.name;
      opt.dataset.activeOrderId = table.activeOrderId || '';
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Failed to load tables from API:', e);
  }
}

window.handleTableChange = async function() {
  const tableSelect = document.getElementById('tableSelect');
  const tableId = tableSelect?.value;
  
  if (!tableId) {
    currentDineInOrder = null;
    cart = [];
    updateCartDisplay();
    return;
  }

  const selectedOpt = tableSelect.options[tableSelect.selectedIndex];
  const activeOrderId = selectedOpt.dataset.activeOrderId;

  if (!activeOrderId) {
    currentDineInOrder = null;
    cart = [];
    updateCartDisplay();
    alert('This table has no active order. Please open the table and add items in Dine-In Management page first.');
    tableSelect.value = '';
    return;
  }

  try {
    const order = await window.apiFetch(`/orders/${activeOrderId}`);
    if (!order) {
      alert('Active order not found.');
      return;
    }

    currentDineInOrder = order;

    cart = (order.items || []).filter(item => item.kitchenStatus !== 'cancelled').map(item => {
      const product = window.DB.getPart(item.productId);
      return {
        product_id: item.productId,
        code: item.productCode || (product ? product.partNumber : ''),
        name: item.name,
        qty: item.qty,
        price: item.price,
        basePrice: item.price,
        cost: item.cost,
        discount: { type: 'none', value: 0 },
        addons: [],
        addonSignature: '',
        sizeSignature: 'single',
        sizeId: null,
        note: item.note || '',
        lineId: item.lineId
      };
    });

    updateCartDisplay();
  } catch (e) {
    console.error('Failed to load table order:', e);
    alert('Failed to load table order: ' + e.message);
  }
};

window.clearCart = function() {
  if (confirm(t('confirm_clear_cart') || 'Are you sure you want to clear the cart?')) {
    cart = [];
    currentDineInOrder = null;
    globalDiscountType = 'none';
    globalDiscountValue = 0;
    clearSelectedCustomer();
    const tableSelect = document.getElementById('tableSelect');
    if (tableSelect) tableSelect.value = '';
    updateCartDisplay();
  }
};

window.toggleOrderType = function () {
  const type = document.querySelector('input[name="orderType"]:checked')?.value;
  const tableDiv = document.getElementById('tableSelection');
  const salesmanLabel = document.getElementById('salesmanLabel');
  const salesmanDiv = document.getElementById('salesmanSection');

  if (type === 'dine_in') {
    tableDiv.style.display = 'block';
    if (salesmanDiv) salesmanDiv.style.display = 'block';
    if (salesmanLabel) salesmanLabel.textContent = t('waiter') || 'Waiter:';
    loadSalesmen('waiter');
    loadTables();
  } else {
    if (currentDineInOrder) {
      currentDineInOrder = null;
      cart = [];
      updateCartDisplay();
    }
    const tableSelect = document.getElementById('tableSelect');
    if (tableSelect) tableSelect.value = '';

    if (type === 'delivery') {
      tableDiv.style.display = 'none';
      if (salesmanDiv) salesmanDiv.style.display = 'block';
      if (salesmanLabel) salesmanLabel.textContent = t('delivery_man') || 'Delivery Man:';
      loadSalesmen('delivery');
    } else {
      // Take Away
      tableDiv.style.display = 'none';
      if (salesmanDiv) salesmanDiv.style.display = 'none';
      loadSalesmen([]);
    }
  }

  // Recalculate Prices in Cart
  if (cart.length > 0) {
    cart.forEach(item => {
      const product = window.DB.getPart(item.product_id);
      if (!product) return;

      let basePrice = 0;
      let sizeObj = null;
      if (item.sizeId) {
        sizeObj = product.sizes.find(s => s.id == item.sizeId);
      }

      // Determine Price
      if (sizeObj) {
        if (type === 'dine_in' && sizeObj.priceDineIn) basePrice = sizeObj.priceDineIn;
        else if (type === 'delivery' && sizeObj.priceDelivery) basePrice = sizeObj.priceDelivery;
        else basePrice = sizeObj.price;
      } else {
        if (type === 'dine_in' && product.priceDineIn) basePrice = product.priceDineIn;
        else if (type === 'delivery' && product.priceDelivery) basePrice = product.priceDelivery;
        else basePrice = product.price;
      }

      // Update item
      item.basePrice = basePrice;
      let unitPrice = basePrice;
      item.addons.forEach(a => unitPrice += a.price);
      item.price = unitPrice;
    });
    updateCartDisplay();
  }

  // Delivery UI Toggle
  const deliverySection = document.getElementById('deliverySection');
  if (deliverySection) {
    deliverySection.style.display = (type === 'delivery') ? 'block' : 'none';
  }

  // Update Taxes based on new Order Type
  if (typeof applyTaxesForOrderType === 'function') {
    applyTaxesForOrderType();
    updateCartSummary();
  }
};
// ===================== DELIVERY CUSTOMER LOGIC =====================
let currentCustomer = null;
let selectedAddress = null;
let currentDeliveryFee = 0;

async function searchCustomerPos() {
  const q = document.getElementById('custSearchPos').value.trim().toLowerCase();
  if (!q) return;

  let allCustomers = [];
  try {
    if (window.electronAPI && window.electronAPI.getCustomers) {
      allCustomers = await window.electronAPI.getCustomers();
    } else {
      allCustomers = window.DB.getCustomers();
    }
  } catch (e) {
    console.error('Failed to fetch customers, falling back to local DB', e);
    allCustomers = window.DB.getCustomers();
  }

  // Fuzzy search
  const found = allCustomers.find(c => (c.mobile && c.mobile.includes(q)) || (c.name && c.name.toLowerCase().includes(q)));

  if (found) {
    selectCustomer(found);
  } else {
    alert('Customer not found. You can add a new one.');
    document.getElementById('newCustomerBtnArea').style.display = 'block';
  }
}

function selectCustomer(customer) {
  currentCustomer = customer;
  document.getElementById('selectedCustomerDisplay').style.display = 'block';
  document.getElementById('selCustName').textContent = customer.name;
  document.getElementById('selCustMobile').textContent = customer.mobile;
  document.getElementById('newCustomerBtnArea').style.display = 'none';
  document.getElementById('custSearchPos').value = '';

  // Load Addresses
  const addrSelect = document.getElementById('custAddressSelect');
  addrSelect.innerHTML = '';

  if (customer.addresses && customer.addresses.length > 0) {
    customer.addresses.forEach((addr, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = formatAddress(addr);
      addrSelect.appendChild(opt);
    });
    document.getElementById('addressSection').style.display = 'block';

    // Select first by default
    setAddressAndFee(customer.addresses[0]);

    addrSelect.onchange = () => {
      setAddressAndFee(customer.addresses[addrSelect.value]);
    };
  } else {
    document.getElementById('addressSection').style.display = 'block';
    const opt = document.createElement('option');
    opt.textContent = "-- No Addresses --";
    addrSelect.appendChild(opt);
    currentDeliveryFee = 0;
    updateCartDisplay();
  }
}

function setAddressAndFee(addr) {
  selectedAddress = addr;
  // Find Fee
  const areas = window.DB.getDeliveryAreas();
  const area = areas.find(a => a.name === addr.area);
  if (area) {
    currentDeliveryFee = area.fee || 0;
  } else {
    currentDeliveryFee = 0;
  }
  updateCartDisplay();
}

function clearSelectedCustomer() {
  currentCustomer = null;
  selectedAddress = null;
  currentDeliveryFee = 0;
  document.getElementById('selectedCustomerDisplay').style.display = 'none';
  document.getElementById('addressSection').style.display = 'none';
  document.getElementById('newCustomerBtnArea').style.display = 'none';
  document.getElementById('custAddressSelect').innerHTML = '';
  updateCartDisplay();
}

function formatAddress(addr) {
  return `${addr.area} - ${addr.street || ''} ${addr.building ? 'B:' + addr.building : ''}`;
}

function openQuickAddCustomer() {
  document.getElementById('quickCustName').value = '';
  document.getElementById('quickCustMobile').value = document.getElementById('custSearchPos').value;

  // Populate Areas
  const areaSelect = document.getElementById('quickCustArea');
  if (areaSelect) {
    const areas = window.DB.getDeliveryAreas();
    areaSelect.innerHTML = '<option value="">-- Select Area --</option>';
    areas.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.name;
      opt.textContent = `${a.name} (${a.fee})`;
      areaSelect.appendChild(opt);
    });
  }

  // Reset other fields
  ['quickCustStreet', 'quickCustBuilding', 'quickCustFloor', 'quickCustApt', 'quickCustExtra'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  document.getElementById('quickCustomerModal').style.display = 'flex';
}

async function saveQuickCustomer() {
  const name = document.getElementById('quickCustName').value.trim();
  const mobile = document.getElementById('quickCustMobile').value.trim();
  if (!name || !mobile) { alert('Name and Mobile required'); return; }

  const area = document.getElementById('quickCustArea').value;
  const street = document.getElementById('quickCustStreet').value.trim();
  const building = document.getElementById('quickCustBuilding').value.trim();
  const floor = document.getElementById('quickCustFloor').value.trim();
  const apt = document.getElementById('quickCustApt').value.trim();
  const extra = document.getElementById('quickCustExtra').value.trim();

  const newCust = {
    name,
    mobile,
    createdAt: new Date().toISOString(),
    addresses: []
  };

  if (area || street) {
    newCust.addresses.push({
      id: Date.now(),
      area: area || 'General',
      street: street,
      building: building,
      floor: floor,
      apt: apt,
      extra: extra
    });
  }

  let savedCustomer = null;
  try {
    if (window.electronAPI && window.electronAPI.saveCustomer) {
      savedCustomer = await window.electronAPI.saveCustomer(newCust);
    } else {
      newCust.id = Date.now();
      window.DB.saveCustomer(newCust);
      savedCustomer = newCust;
    }
  } catch (e) {
    console.error('Failed to save customer to cloud, saving locally', e);
    newCust.id = Date.now();
    window.DB.saveCustomer(newCust);
    savedCustomer = newCust;
  }

  document.getElementById('quickCustomerModal').style.display = 'none';
  if (savedCustomer) {
    selectCustomer(savedCustomer);
  }
}

// ===================== HOLD / DRAFT LOGIC =====================
function holdTransaction() {
  if (cart.length === 0) { alert('Cart is empty'); return; }

  const pendingOrder = {
    id: Date.now(),
    date: new Date().toISOString(),
    cart: [...cart],
    customer: currentCustomer,
    orderType: document.querySelector('input[name="orderType"]:checked').value,
    salesman: document.getElementById('salesmanSelect')?.value,
    tableId: document.getElementById('tableSelect')?.value,
    address: selectedAddress,
    deliveryFee: currentDeliveryFee
  };

  const pending = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
  pending.push(pendingOrder);
  localStorage.setItem('pendingOrders', JSON.stringify(pending));

  cart = [];
  clearSelectedCustomer();
  updateCartDisplay();
  updatePendingCount();
  alert(t('transaction_held') || 'Transaction on Hold');
}

function updatePendingCount() {
  const pending = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
  const btn = document.getElementById('pendingOrdersBtn');
  if (btn) btn.textContent = pending.length;
}

function openPendingOrders() {
  const pending = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
  if (pending.length === 0) { alert(t('no_pending_orders') || 'No pending orders'); return; }

  const list = document.getElementById('pendingOrdersList');
  list.innerHTML = '';

  pending.forEach((order, index) => {
    const div = document.createElement('div');
    div.style.borderBottom = '1px solid #eee';
    div.style.padding = '10px';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';

    let info = `${new Date(order.date).toLocaleTimeString()} - ${order.cart.length} items`;
    if (order.customer) info += ` | ${order.customer.name}`;

    div.innerHTML = `
           <div>${info}</div>
           <div>
             <button class="btn btn-sm btn-primary" onclick="restorePendingOrder(${index})">Resume</button>
             <button class="btn btn-sm btn-danger" onclick="deletePendingOrder(${index})">x</button>
           </div>
        `;
    list.appendChild(div);
  });

  document.getElementById('pendingOrdersModal').style.display = 'flex';
}

function restorePendingOrder(index) {
  if (cart.length > 0 && !confirm('Current cart will be cleared. Continue?')) return;

  const pending = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
  const order = pending[index];

  // Restore
  cart = order.cart;
  if (order.customer) selectCustomer(order.customer); // Helper needs to exist or manual set
  else clearSelectedCustomer();

  if (order.address) setAddressAndFee(order.address); // Need to ensure setAddressAndFee sets currentDeliveryFee
  else currentDeliveryFee = 0;

  // Attempt restore UI state
  const radio = document.querySelector(`input[name="orderType"][value="${order.orderType}"]`);
  if (radio) { radio.checked = true; toggleOrderType(); }

  if (order.salesman) document.getElementById('salesmanSelect').value = order.salesman;
  if (order.tableId) document.getElementById('tableSelect').value = order.tableId;

  updateCartDisplay();

  // Remove from pending
  pending.splice(index, 1);
  localStorage.setItem('pendingOrders', JSON.stringify(pending));
  updatePendingCount();
  document.getElementById('pendingOrdersModal').style.display = 'none';
}

function deletePendingOrder(index) {
  if (!confirm('Delete this draft?')) return;
  const pending = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
  pending.splice(index, 1);
  localStorage.setItem('pendingOrders', JSON.stringify(pending));
  updatePendingCount();
  if (pending.length === 0) document.getElementById('pendingOrdersModal').style.display = 'none';
  else openPendingOrders(); // Refresh
}

function openAddAddressModal() {
  if (!currentCustomer) { alert('Select a customer first'); return; }
  document.getElementById('addressModal').style.display = 'flex';
  // reset fields
  ['addrArea', 'addrStreet', 'addrBuilding', 'addrFloor', 'addrApt', 'addrExtra'].forEach(id => document.getElementById(id).value = '');
}

async function saveCheckCustomerAddress() {
  const addr = {
    area: document.getElementById('addrArea').value.trim(),
    street: document.getElementById('addrStreet').value.trim(),
    building: document.getElementById('addrBuilding').value.trim(),
    floor: document.getElementById('addrFloor').value.trim(),
    apt: document.getElementById('addrApt').value.trim(),
    extra: document.getElementById('addrExtra').value.trim(),
    id: Date.now()
  };

  if (!addr.street && !addr.area) { alert('Area or Street required'); return; }

  if (!currentCustomer.addresses) currentCustomer.addresses = [];
  currentCustomer.addresses.push(addr);

  try {
    if (window.electronAPI && window.electronAPI.saveCustomer) {
      const result = await window.electronAPI.saveCustomer(currentCustomer);
      if (result) {
        currentCustomer = result;
      }
    } else {
      window.DB.saveCustomer(currentCustomer);
    }
  } catch (e) {
    console.error('Failed to sync customer address, saving locally', e);
    window.DB.saveCustomer(currentCustomer);
  }

  // Refresh list
  selectCustomer(currentCustomer);

  // Select the new one
  const select = document.getElementById('custAddressSelect');
  select.value = currentCustomer.addresses.length - 1;
  selectedAddress = addr;

  document.getElementById('addressModal').style.display = 'none';
}

// ===================== MANAGER PIN SYSTEM =====================
// Uses global requireManagerPin, confirmManagerPin, cancelManagerPin from js/shared-nav.js

// ===================== SPLIT PAYMENT SYSTEM =====================
window.openSplitPaymentModal = function() {
  if (cart.length === 0) return;
  document.getElementById('splitTotalLabel').textContent = `${currentGrandTotal.toFixed(2)} ${t('currency') || 'EGP'}`;
  document.getElementById('splitCashInput').value = currentGrandTotal.toFixed(2);
  document.getElementById('splitCardInput').value = 0;
  document.getElementById('splitPaymentModal').style.display = 'flex';
  calculateSplitDifference();
};

window.closeSplitPaymentModal = function() {
  document.getElementById('splitPaymentModal').style.display = 'none';
};

window.calculateSplitDifference = function() {
  const cash = parseFloat(document.getElementById('splitCashInput').value || 0);
  const card = parseFloat(document.getElementById('splitCardInput').value || 0);
  const diff = currentGrandTotal - (cash + card);

  const label = document.getElementById('splitDiffLabel');
  const banner = document.getElementById('splitDiffBanner');
  const confirmBtn = document.getElementById('splitConfirmBtn');

  if (Math.abs(diff) < 0.01) {
    banner.style.background = '#e8f5e9';
    banner.style.color = '#2e7d32';
    label.textContent = `✓ Amount matches Grand Total`;
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
  } else {
    banner.style.background = '#ffebee';
    banner.style.color = '#c62828';
    if (diff > 0) {
      label.textContent = `Remaining: ${diff.toFixed(2)} ${t('currency') || 'EGP'}`;
    } else {
      label.textContent = `Overage: ${Math.abs(diff).toFixed(2)} ${t('currency') || 'EGP'}`;
    }
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
  }
};

window.confirmSplitPayment = function() {
  document.getElementById('splitPaymentModal').style.display = 'none';
  processSale('split');
};

// ===================== GLOBAL DISCOUNT SYSTEM =====================
let globalDiscountType = 'none';
let globalDiscountValue = 0;

window.openGlobalDiscountModal = function() {
  requireManagerPin('Authorize global discount', () => {
    document.getElementById('globalDiscountType').value = globalDiscountType;
    document.getElementById('globalDiscountVal').value = globalDiscountValue;
    document.getElementById('globalDiscountModal').style.display = 'flex';
  });
};

window.closeGlobalDiscountModal = function() {
  document.getElementById('globalDiscountModal').style.display = 'none';
};

window.saveGlobalDiscount = function() {
  globalDiscountType = document.getElementById('globalDiscountType').value;
  globalDiscountValue = parseFloat(document.getElementById('globalDiscountVal').value || 0);
  updateCartSummary();
  closeGlobalDiscountModal();
};

// ===================== DISCOUNT MODAL =====================
function openDiscountModal(index) {
  requireManagerPin('Authorize discount on item', () => {
    currentDiscountIndex = index;
    const item = cart[index];
    document.getElementById('discountType').value = item.discount?.type || 'none';
    document.getElementById('discountValue').value = item.discount?.value || 0;
    document.getElementById('discountModal').style.display = 'flex';
  });
}

function closeDiscountModal() {
  currentDiscountIndex = null;
  document.getElementById('discountModal').style.display = 'none';
}

function saveDiscount() {
  const type = document.getElementById('discountType').value;
  const value = parseFloat(document.getElementById('discountValue').value);
  if (!cart[currentDiscountIndex]) return;
  cart[currentDiscountIndex].discount = { type, value: isNaN(value) ? 0 : value };
  updateCartDisplay();
  closeDiscountModal();
}

// Remove from cart with manager PIN gate
window.removeFromCart = function (index) {
  requireManagerPin('Authorize item removal from cart', () => {
    cart.splice(index, 1);
    updateCartDisplay();
  });
};


// ===================== CART =====================
let pendingProduct = null;
let selectedAddons = [];
let selectedSize = null; // {id, name, price}

function addToCart(product) {
  // Logic: 
  // 1. If hasSizes -> Open Modal (Force size selection).
  // 2. If allowAllAddons or specific addons -> Open Modal.
  // 3. Else -> Add directly (Single, No Addons).

  const hasSpecificAddons = product.allowedAddons && product.allowedAddons.length > 0;
  const allowsAll = !!product.allowAllAddons;
  const hasSizes = !!product.hasSizes;

  if (hasSizes || hasSpecificAddons || allowsAll) {
    prodWithAddons(product);
  } else {
    addItemToCartFinal(product, [], null);
  }
}

function prodWithAddons(product) {
  pendingProduct = product;
  selectedAddons = [];
  selectedSize = null;

  const modal = document.getElementById('addonsModal');
  document.getElementById('addonsProductTitle').textContent = product.name;

  document.getElementById('addonModalNote').value = ''; // Reset note

  // Setup Sizes
  const sizeArea = document.getElementById('size-selection-area');
  const sizeList = document.getElementById('sizes-list');

  if (product.hasSizes && product.sizes && product.sizes.length > 0) {
    sizeArea.style.display = 'block';
    sizeList.innerHTML = '';

    // Auto-select first? Or require click? 
    // Let's require click visually, but maybe default to first?
    // Better to require click.

    product.sizes.forEach(size => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-outline-primary size-btn'; // need css for active
      btn.textContent = `${size.name} (${size.price})`;
      btn.style.border = '1px solid #ccc';
      btn.style.padding = '5px 10px';
      btn.style.cursor = 'pointer';

      btn.onclick = (e) => {
        // Highlight logic
        document.querySelectorAll('.size-btn').forEach(b => b.style.background = 'white');
        e.target.style.background = '#d0eaff';
        selectedSize = size;
      };
      sizeList.appendChild(btn);
    });
  } else {
    sizeArea.style.display = 'none';
    selectedSize = null; // Single product
  }

  // Setup Addons
  const list = document.getElementById('addonsList');
  list.innerHTML = '<p>Loading...</p>';
  modal.style.display = 'flex';

  let allowedItems = [];
  const allParts = window.DB.getParts();

  if (product.allowAllAddons) {
    // Case-insensitive category matching (consistent with products-app.js)
    allowedItems = allParts.filter(p => {
      const c = (p.category || '').toLowerCase();
      return c.includes('add-on') || c.includes('addon') || c.includes('extra');
    });
  } else {
    // Use loose equality (==) to handle int/string ID mismatches
    const allowedAddons = product.allowedAddons || [];
    allowedItems = allParts.filter(p => allowedAddons.some(aid => aid == p.id));
  }

  list.innerHTML = '';
  if (allowedItems.length === 0) {
    list.innerHTML = '<p>No add-ons available.</p>';
  } else {
    allowedItems.forEach(addon => {
      const div = document.createElement('div');
      div.style.padding = '5px';
      div.style.borderBottom = '1px solid #eee';
      div.innerHTML = `
        <label style="cursor:pointer; display:flex; justify-content:space-between;">
           <span>
             <input type="checkbox" value="${addon.id}" data-price="${addon.price}" data-name="${addon.name}" onchange="toggleAddonSelection(this)">
             ${addon.name}
           </span>
           <span>+${addon.price}</span>
        </label>
      `;
      list.appendChild(div);
    });
  }
}

function toggleAddonSelection(cb) {
  // Keep original ID type — may be string (MongoDB) or int (localStorage)
  const rawId = cb.value;
  const id = isNaN(rawId) ? rawId : parseInt(rawId);
  const price = parseFloat(cb.dataset.price);
  const name = cb.dataset.name;

  if (cb.checked) {
    selectedAddons.push({ id, name, price, qty: 1 });
  } else {
    selectedAddons = selectedAddons.filter(a => a.id != id);
  }
}

function confirmAddons() {
  if (pendingProduct) {
    // Validation: If has sizes, must select size
    if (pendingProduct.hasSizes && !selectedSize) {
      alert('Please select a size first.');
      return;
    }

    const note = document.getElementById('addonModalNote').value.trim();
    addItemToCartFinal(pendingProduct, selectedAddons, selectedSize, note);
    closeAddonsModal();
  }
}

function closeAddonsModal() {
  document.getElementById('addonsModal').style.display = 'none';
  pendingProduct = null;
  selectedAddons = [];
  selectedSize = null;
}

window.confirmAddons = confirmAddons;
window.closeAddonsModal = closeAddonsModal;
window.toggleAddonSelection = toggleAddonSelection;

function addItemToCartFinal(product, addons = [], sizeObj = null, note = '') {
  addons.sort((a, b) => a.id - b.id);
  const addonSignature = addons.map(a => a.id).join(',');
  const sizeSignature = sizeObj ? sizeObj.id : 'single';

  // Snapshot Cost
  const baseCost = sizeObj ? (sizeObj.cost || 0) : (product.cost || 0);
  let totalCost = baseCost;
  addons.forEach(a => totalCost += (a.cost || 0)); // Assuming add-ons have cost property snapshot?
  // Add-ons usually just price in 'addon-select', we might need to fetch cost.
  // The 'addons' array processed in toggleAddonSelection doesn't have cost. 
  // Let's fix that. We need to look up cost.

  // Re-fetch add-on costs from DB to be safe
  const addonCosts = addons.reduce((sum, a) => {
    const part = window.DB.getPart(a.id);
    return sum + (part ? (part.cost || 0) : 0);
  }, 0);

  totalCost = baseCost + addonCosts;

  // Unique signature covers Size + Addons
  const existingItem = cart.find(i =>
    i.product_id === product.id &&
    i.addonSignature === addonSignature &&
    i.sizeSignature === sizeSignature
  );

  // If Size selected, use Size Price. Else Product Price.
  const basePrice = sizeObj ? sizeObj.price : product.price;

  if (existingItem) {
    existingItem.qty++;
  } else {
    let unitPrice = basePrice;
    addons.forEach(a => unitPrice += a.price);

    cart.push({
      product_id: product.id,
      code: product.partNumber,
      name: product.name,
      sizeName: sizeObj ? sizeObj.name : '',
      price: unitPrice,
      basePrice: basePrice,
      cost: totalCost, // Snapshot Cost Here
      qty: 1,
      discount: { type: 'none', value: 0 },
      addons: addons,
      addonSignature: addonSignature,
      sizeSignature: sizeSignature,
      sizeId: sizeObj ? sizeObj.id : null,
      note: note
    });
  }

  updateCartDisplay();
}

window.incrementQty = function(index) {
  if (cart[index]) {
    cart[index].qty++;
    updateCartDisplay();
  }
};

window.decrementQty = function(index) {
  if (cart[index]) {
    cart[index].qty--;
    if (cart[index].qty <= 0) {
      cart.splice(index, 1);
    }
    updateCartDisplay();
  }
};

let currentNoteItemIndex = null;

window.editItemNote = function(index) {
  const item = cart[index];
  if (!item) return;
  currentNoteItemIndex = index;
  document.getElementById('itemNoteTitle').textContent = item.name;
  document.getElementById('itemNoteTextarea').value = item.note || '';
  document.getElementById('itemNoteModal').style.display = 'flex';
  document.getElementById('itemNoteTextarea').focus();
};

window.appendQuickTag = function(tag) {
  const txt = document.getElementById('itemNoteTextarea');
  const current = txt.value.trim();
  txt.value = current ? `${current}, ${tag}` : tag;
  txt.focus();
};

window.closeItemNoteModal = function() {
  document.getElementById('itemNoteModal').style.display = 'none';
  currentNoteItemIndex = null;
};

window.saveItemNote = function() {
  if (currentNoteItemIndex !== null && cart[currentNoteItemIndex]) {
    cart[currentNoteItemIndex].note = document.getElementById('itemNoteTextarea').value.trim();
    updateCartDisplay();
  }
  closeItemNoteModal();
};

let currentSizeItemIndex = null;

window.openCartSizeModal = function(index) {
  const item = cart[index];
  if (!item) return;
  const product = window.DB.getPart(item.product_id);
  if (!product || !product.hasSizes || !product.sizes) return;

  currentSizeItemIndex = index;
  document.getElementById('cartSizeProductTitle').textContent = product.name;
  
  const container = document.getElementById('cartSizeOptions');
  container.innerHTML = product.sizes.map(size => {
    const isCurrent = item.sizeId == size.id;
    return `
      <button onclick="selectCartSize(${size.id})" 
        class="w-full flex items-center justify-between p-3 border ${isCurrent ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800'} rounded-lg hover:border-amber-500 transition-colors text-left text-white font-bold">
        <span>${size.name}</span>
        <span class="text-amber-500">${parseFloat(size.price).toFixed(2)} EGP</span>
      </button>
    `;
  }).join('');

  document.getElementById('cartSizeModal').style.display = 'flex';
};

window.closeCartSizeModal = function() {
  document.getElementById('cartSizeModal').style.display = 'none';
  currentSizeItemIndex = null;
};

window.selectCartSize = function(sizeId) {
  if (currentSizeItemIndex !== null && cart[currentSizeItemIndex]) {
    const item = cart[currentSizeItemIndex];
    const product = window.DB.getPart(item.product_id);
    const sizeObj = product.sizes.find(s => s.id == sizeId);
    if (sizeObj) {
      item.sizeId = sizeObj.id;
      item.sizeName = sizeObj.name;
      item.sizeSignature = String(sizeObj.id);
      
      const basePrice = sizeObj.price;
      let unitPrice = basePrice;
      if (item.addons) {
        item.addons.forEach(a => unitPrice += a.price);
      }
      item.price = unitPrice;
      item.basePrice = basePrice;

      const baseCost = sizeObj.cost || 0;
      const addonCosts = (item.addons || []).reduce((sum, a) => {
        const part = window.DB.getPart(a.id);
        return sum + (part ? (part.cost || 0) : 0);
      }, 0);
      item.cost = baseCost + addonCosts;

      updateCartDisplay();
    }
  }
  closeCartSizeModal();
};

function updateCartDisplay() {
  const container = document.getElementById("cartItems");
  container.innerHTML = "";
  if (cart.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#666;">${t('cart_empty')}</p>`;
    toggleCartButtons(false);
    updateCartSummary();
    return;
  }

  cart.forEach((item, index) => {
    let discountText = "";
    let finalPrice = parseFloat(item.price || 0);

    if (item.discount?.type === "percent") {
      finalPrice *= (1 - item.discount.value / 100);
      discountText = ` (-${item.discount.value}%)`;
    } else if (item.discount?.type === "value") {
      finalPrice -= item.discount.value;
      discountText = ` (-${item.discount.value})`; // Currency handled in summary
    }

    const product = window.DB.getPart(item.product_id);
    const imgUrl = product ? product.image : null;
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" class="w-full h-full object-cover" onerror="this.style.display='none'">`
      : `<span class="material-symbols-outlined text-slate-400">restaurant</span>`;

    const div = document.createElement("div");
    // Tailwind cart row
    div.className = "flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800 animate-fade-in";

    let addonsHtml = '';
    if (item.addons && item.addons.length > 0) {
      addonsHtml = `<div class="text-[9px] text-slate-400 mt-0.5 ml-1">` +
        item.addons.map(a => `+ ${a.name}`).join(', ') +
        `</div>`;
    }

    // Display Size if exists
    const displayName = item.sizeName ? `${item.name} (${item.sizeName})` : item.name;

    const hasSizes = product && product.hasSizes && product.sizes && product.sizes.length > 0;

    div.innerHTML = `
      <div class="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white flex items-center justify-center border border-slate-100 dark:border-slate-700">
        ${imgHtml}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-bold truncate text-slate-800 dark:text-slate-200" title="${displayName}">${displayName}</p>
        <div class="flex items-center gap-1.5 mt-0.5">
          <button onclick="decrementQty(${index})" class="w-4 h-4 flex items-center justify-center bg-slate-200 dark:bg-slate-700 rounded-full font-black text-[10px] hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition-colors">-</button>
          <span class="text-[10px] text-slate-500 font-bold min-w-[12px] text-center">${item.qty}</span>
          <button onclick="incrementQty(${index})" class="w-4 h-4 flex items-center justify-center bg-slate-200 dark:bg-slate-700 rounded-full font-black text-[10px] hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition-colors">+</button>
          <span class="text-[10px] text-slate-400 font-medium ml-1">x ${parseFloat(item.price || 0).toFixed(2)}${discountText}</span>
        </div>
        ${addonsHtml}
        ${item.note ? `<p class="text-[10px] text-amber-600 font-bold italic mt-0.5">Note: ${item.note}</p>` : ''}
      </div>
      <div class="flex flex-col items-end gap-1">
        <p class="text-xs font-black text-slate-800 dark:text-slate-100">${(finalPrice * item.qty).toFixed(2)}</p>
        <div class="flex items-center gap-1">
           <button onclick="editItemNote(${index})" class="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 hover:text-amber-500 hover:border-amber-300 transition-colors" title="Add Note">
             <span class="material-symbols-outlined text-[14px]">edit_note</span>
           </button>
           ${hasSizes ? `
           <button onclick="openCartSizeModal(${index})" class="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 hover:text-green-500 hover:border-green-300 transition-colors" title="Change Size">
             <span class="material-symbols-outlined text-[14px]">aspect_ratio</span>
           </button>
           ` : ''}
           <button onclick="openDiscountModal(${index})" class="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 hover:text-blue-500 hover:border-blue-300 transition-colors" title="${t('discount')}">
             <span class="material-symbols-outlined text-[14px]">percent</span>
           </button>
           <button onclick="removeFromCart(${index})" class="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 hover:text-red-500 hover:border-red-300 transition-colors" title="${t('delete')}">
             <span class="material-symbols-outlined text-[14px]">delete</span>
           </button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });

  toggleCartButtons(true);
  updateCartSummary();
}

function toggleCartButtons(enabled) {
  const btns = ['cashBtn', 'cardBtn', 'mobileBtn', 'splitBtn', 'talabatCashBtn', 'talabatVisaBtn', 'holdBtn', 'clearCartBtn'];
  btns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !enabled;
  });
}

// ===================== TAX LOGIC =====================
let activeTaxes = [];
let currentOrderTaxes = []; // Subset of activeTaxes applied to current order

async function loadTaxes() {
  try {
    if (window.apiFetch) {
      const taxes = await window.apiFetch('/taxes?enabled=true');
      activeTaxes = taxes || [];
      applyTaxesForOrderType();
      updateCartSummary();
    }
  } catch (e) {
    console.warn('Failed to load taxes', e);
  }
}

function applyTaxesForOrderType() {
  const orderType = document.querySelector('input[name="orderType"]:checked')?.value || 'take_away';
  // Filter active taxes that match this order type
  // If orderTypes is undefined (legacy), assume all.
  currentOrderTaxes = activeTaxes.filter(t => {
    if (!t.orderTypes) return true;
    try {
      const types = typeof t.orderTypes === 'string' ? JSON.parse(t.orderTypes) : t.orderTypes;
      if (Array.isArray(types)) {
        if (types.length === 0) return true;
        return types.includes(orderType);
      }
    } catch (e) {
      console.warn('Failed to parse tax orderTypes', e);
    }
    return true;
  });
}

// Update this function to be called on init
const originalLoadProducts = loadProducts;
loadProducts = function () {
  originalLoadProducts();
  loadTaxes();
};

function openTaxModal() {
  const list = document.getElementById('taxToggleList');
  list.innerHTML = '';

  if (activeTaxes.length === 0) {
    list.innerHTML = '<p class="text-sm text-slate-500">No taxes configured.</p>';
  }

  activeTaxes.forEach(tax => {
    const isApplied = currentOrderTaxes.some(t => t._id === tax._id);
    const div = document.createElement('div');
    div.className = "flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200";
    div.innerHTML = `
       <label class="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" class="w-4 h-4 text-blue-600 rounded" 
             onchange="toggleTax('${tax._id}', this.checked)" ${isApplied ? 'checked' : ''}>
          <span class="text-sm font-bold text-slate-700">${tax.name} (${tax.percentage}%)</span>
       </label>
    `;
    list.appendChild(div);
  });

  document.getElementById('taxesModal').style.display = 'flex';
}

window.toggleTax = function (taxId, checked) {
  if (checked) {
    const tax = activeTaxes.find(t => t._id === taxId);
    if (tax && !currentOrderTaxes.some(t => t._id === taxId)) {
      currentOrderTaxes.push(tax);
    }
  } else {
    currentOrderTaxes = currentOrderTaxes.filter(t => t._id !== taxId);
  }
  updateCartSummary();
};

window.openTaxModal = openTaxModal;

// ===================== CART SUMMARY UPDATE =====================

function updateCartSummary() {
  let subtotal = 0;
  let discountTotal = 0;

  cart.forEach((item, idx) => {
    const rawPrice = item.price;
    const qty = item.qty;
    const itemTotal = qty * parseFloat(rawPrice);

    let discount = 0;

    if (item.discount) {
      if (item.discount.type === "percent") {
        discount = itemTotal * (parseFloat(item.discount.value) / 100);
      } else if (item.discount.type === "value") {
        discount = parseFloat(item.discount.value);
      }
    }

    subtotal += itemTotal;
    discountTotal += discount;
  });

  // Calculate Global Invoice Discount
  let globalDiscountAmt = 0;
  const currentSubTotalAfterItemDiscounts = subtotal - discountTotal;
  if (globalDiscountType === "percent") {
    globalDiscountAmt = currentSubTotalAfterItemDiscounts * (globalDiscountValue / 100);
  } else if (globalDiscountType === "value") {
    globalDiscountAmt = globalDiscountValue;
  }
  discountTotal += globalDiscountAmt;

  const totalAfterDiscount = subtotal - discountTotal;

  // Calculate Taxes
  let taxTotal = 0;
  const taxListEl = document.getElementById("taxList");
  if (taxListEl) taxListEl.innerHTML = '';

  const appliedTaxesList = [];

  currentOrderTaxes.forEach(tax => {
    const amount = totalAfterDiscount * (tax.percentage / 100);
    taxTotal += amount;
    appliedTaxesList.push({ ...tax, amount });

    if (taxListEl) {
      const row = document.createElement('div');
      row.className = "flex justify-between text-[11px] font-medium text-slate-500";
      row.innerHTML = `<span>${tax.name} (${tax.percentage}%)</span><span>${amount.toFixed(2)}</span>`;
      taxListEl.appendChild(row);
    }
  });

  const fee = (typeof currentDeliveryFee !== 'undefined') ? currentDeliveryFee : 0;
  const grandTotal = totalAfterDiscount + taxTotal + fee;
  currentGrandTotal = grandTotal;

  // Render
  document.getElementById("cartSubtotal").textContent = subtotal.toFixed(2);
  document.getElementById("cartDiscount").textContent = `- ${discountTotal.toFixed(2)}`;

  // Update Tax Label to show total tax amount if needed, or just keep individual rows
  // document.getElementById("cartTax").textContent = taxTotal.toFixed(2); // Removed static id use

  const delRow = document.getElementById("deliveryFeeRow");
  if (delRow) {
    if (fee > 0) {
      delRow.style.display = 'flex';
      document.getElementById("cartDeliveryFee").textContent = fee.toFixed(2);
    } else {
      delRow.style.display = 'none';
    }
  }

  document.getElementById("cartTotal").textContent = `${t('total') || 'Total'}: ${grandTotal.toFixed(2)}`;
  document.getElementById("cartCounter").textContent = cart.length;

  const mbBadge = document.getElementById("mobileCartBadge");
  if (mbBadge) {
    mbBadge.textContent = cart.length;
    mbBadge.style.display = cart.length > 0 ? 'block' : 'none';
  }
}

// ===================== SALE =====================
function getProductCost(code) {
  const product = allProducts.find(p => p.code === code);
  return product?.cost || 0;
}

function validateIngredientStock() {
  const shortages = [];
  const requiredIngredients = {}; // Map: ingredientId -> requiredQty

  for (const item of cart) {
    const product = window.DB.getPart(item.product_id);
    if (!product) continue;

    // Skip validation for service and simple items (only validate recipe items)
    const itemType = product.itemType || product.type;
    if (itemType === 'service' || itemType === 'simple') {
      continue;
    }

    // Determine if it has a recipe
    let recipeToUse = [];
    if (item.sizeId && product.hasSizes) {
      const size = product.sizes.find(s => s.id == item.sizeId);
      recipeToUse = size ? (size.recipe || []) : [];
    } else {
      recipeToUse = product.recipe || [];
    }

    if (recipeToUse && recipeToUse.length > 0) {
      // Recipe item: aggregate ingredient requirements
      for (const ingItem of recipeToUse) {
        const factor = ingItem.conversionFactor || 1;
        let consumeQty = 0;

        if (ingItem.wasteType === 'fixed') {
          consumeQty = (parseFloat(ingItem.qty) + parseFloat(ingItem.wasteValue || 0)) * item.qty * factor;
        } else {
          const w = parseFloat(ingItem.wasteValue) || parseFloat(ingItem.wastePercent) || 0;
          if (w < 100) {
            const yieldPct = (100 - w) / 100;
            const grossUsageQty = parseFloat(ingItem.qty) / yieldPct;
            consumeQty = grossUsageQty * item.qty * factor;
          } else {
            consumeQty = parseFloat(ingItem.qty) * item.qty * factor;
          }
        }

        const ingId = ingItem.ingredientId;
        if (!requiredIngredients[ingId]) {
          requiredIngredients[ingId] = 0;
        }
        requiredIngredients[ingId] += consumeQty;
      }
    }
  }

  // Check ingredient stock
  for (const ingId in requiredIngredients) {
    const ingredient = window.DB.getIngredient(parseInt(ingId));
    const required = requiredIngredients[ingId];
    const available = ingredient ? (parseFloat(ingredient.stock) || 0) : 0;
    if (available < required) {
      const name = ingredient ? ingredient.name : `Ingredient #${ingId}`;
      const unit = ingredient ? (ingredient.unit || '') : '';
      shortages.push(`${name}: Required ${required.toFixed(3)}${unit}, Available ${available.toFixed(3)}${unit} (Shortage: ${(required - available).toFixed(3)}${unit})`);
    }
  }

  return shortages;
}

async function processSale(method) {
  if (cart.length === 0) return;

  if (!currentShift) {
    alert('You are currently in Viewing Mode. Please open or join a shift to complete a sale.');
    return;
  }

  // Validate Stock before proceeding
  const stockShortages = validateIngredientStock();
  if (stockShortages.length > 0) {
    alert(`Insufficient Stock:\n\n${stockShortages.join('\n')}`);
    return;
  }

  const orderType = document.querySelector('input[name="orderType"]:checked')?.value || 'take_away';
  const salesmanSelect = document.getElementById('salesmanSelect');
  const salesman = salesmanSelect?.value || '';
  const tableSelect = document.getElementById('tableSelect');
  const tableId = tableSelect?.value || null;
  const tableName = tableId ? tableSelect.options[tableSelect.selectedIndex].text : null;

  // Resolve Cashier Name
  const currentUser = getCurrentUser();
  let cashierName = currentUser.username || "Unknown";
  if (window.DB.getEmployees) {
    const employees = window.DB.getEmployees();
    const linkedEmp = employees.find(e => e.linkedUser === currentUser.username);
    if (linkedEmp) cashierName = linkedEmp.name;
  }

  // Validation
  if (orderType === 'dine_in') {
    if (!tableId) {
      alert(t('alert_select_table') || 'Please select a table for Dine In orders.');
      return;
    }
    if (!salesman) {
      alert(t('alert_select_waiter') || 'Please select a waiter for Dine In orders.');
      return;
    }
  } else if (orderType === 'delivery') {
    if (!salesman) {
      alert(t('alert_select_delivery_man') || 'Please select a Delivery Man.');
      return;
    }
    if (!currentCustomer) {
      alert('Please select a Customer for Delivery.');
      return;
    }
    if (!selectedAddress) {
      alert('Please select a Delivery Address.');
      return;
    }
  }

  const isSplit = method === 'split';
  const splitCash = isSplit ? parseFloat(document.getElementById('splitCashInput').value || 0) : 0;
  const splitCard = isSplit ? parseFloat(document.getElementById('splitCardInput').value || 0) : 0;

  // Recalculate totals
  let subtotal = 0;
  let discountTotal = 0;
  cart.forEach(item => {
    let itemTotal = item.qty * item.price;
    let disc = 0;
    if (item.discount?.type === "percent") disc = itemTotal * (item.discount.value / 100);
    else if (item.discount?.type === "value") disc = item.discount.value;
    subtotal += itemTotal;
    discountTotal += disc;
  });

  // Calculate Global Invoice Discount
  let globalDiscountAmt = 0;
  const currentSubTotalAfterItemDiscounts = subtotal - discountTotal;
  if (globalDiscountType === "percent") {
    globalDiscountAmt = currentSubTotalAfterItemDiscounts * (globalDiscountValue / 100);
  } else if (globalDiscountType === "value") {
    globalDiscountAmt = globalDiscountValue;
  }
  discountTotal += globalDiscountAmt;

  const totalAfterDiscount = subtotal - discountTotal;

  // Capture Applied Taxes
  const appliedTaxes = currentOrderTaxes.map(tax => ({
    id: tax._id,
    name: tax.name,
    percentage: tax.percentage,
    amount: totalAfterDiscount * (tax.percentage / 100)
  }));
  const taxTotal = appliedTaxes.reduce((sum, t) => sum + t.amount, 0);

  const fee = (orderType === 'delivery' && typeof currentDeliveryFee !== 'undefined') ? currentDeliveryFee : 0;
  const grandTotal = totalAfterDiscount + taxTotal + fee;

  const receiptNo = getNextReceiptNumber(); // Ensure this helper exists or use Date.now() fallback if not

  const sale = {
    id: "REC-" + Date.now(),
    receiptNo: receiptNo || String(Date.now()).slice(-4),
    shiftId: currentShift ? (currentShift.id || currentShift._id) : null, // 🟢 Fix: Link Sale to Shift
    date: new Date().toISOString(),
    method: method,
    splitCash: splitCash,
    splitCard: splitCard,
    orderType: orderType,
    tableId: tableId,
    tableName: tableName,
    cashier: cashierName,
    salesman: salesman,
    status: "finished",
    note: document.getElementById('orderNoteInput')?.value.trim() || '',
    kitchenStatus: 'pending',
    total: parseFloat(grandTotal) || 0,
    subtotal: parseFloat(subtotal) || 0,
    discount: parseFloat(discountTotal) || 0,
    tax: parseFloat(taxTotal) || 0,
    appliedTaxes: appliedTaxes,
    deliveryFee: parseFloat(fee) || 0,
    customer: (orderType === 'delivery' && currentCustomer) ? {
      id: currentCustomer.id,
      name: currentCustomer.name,
      mobile: currentCustomer.mobile,
      address: selectedAddress
    } : null,
    items: cart.map(item => ({
      id: item.product_id, // Ensure consistent ID naming
      code: item.code,
      name: item.name, // Will include size in name if added by logic
      sizeName: item.sizeName,
      qty: item.qty,
      price: item.price,
      basePrice: item.basePrice,
      cost: item.cost,
      discount: item.discount,
      note: item.note || '',
      addons: item.addons || []
    }))
  };

  // Stock Deduction Logic
  cart.forEach(item => {
    // 1. Deduct Main Item
    processStockDeduction(item.product_id, item.qty, item.sizeId);

    // 2. Deduct Add-ons
    if (item.addons && item.addons.length > 0) {
      item.addons.forEach(addon => {
        processStockDeduction(addon.id, item.qty * (addon.qty || 1), null);
      });
    }
  });


  // Save Sale
  if (currentDineInOrder) {
    try {
      const res = await window.apiFetch(`/orders/${currentDineInOrder.id || currentDineInOrder._id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          method: method,
          discount: parseFloat(discountTotal) || 0,
          discountType: 'value',
          shiftId: currentShift ? (currentShift.id || currentShift._id) : null,
          tax: parseFloat(taxTotal) || 0,
          splitCash: splitCash,
          splitCard: splitCard,
          closeOverride: true
        })
      });
      if (res && res.success) {
        sale.id = res.saleId;
        sale.receiptNo = res.receiptNo;
        currentDineInOrder = null;
        const tableSelect = document.getElementById('tableSelect');
        if (tableSelect) tableSelect.value = '';
        loadTables();
      } else {
        alert('Failed to close dine-in order.');
        return;
      }
    } catch (e) {
      console.error('Failed to close dine-in order:', e);
      alert('Failed to close dine-in order: ' + e.message);
      return;
    }
  } else if (currentOnlineOrderId) {
    // ☁️ Update Existing Online Order
    window.apiFetch(`/sales/${currentOnlineOrderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
            status: 'finished',
            kitchenStatus: 'completed',
            method: method,
            shiftId: currentShift ? (currentShift.id || currentShift._id) : null,
            cashier: cashierName,
            salesman: salesman,
            appliedTaxes: appliedTaxes,
            date: new Date().toISOString()
        })
    }).then(res => {
        if (res.success) {
            currentOnlineOrderId = null;
            fetchOnlineOrders();
        }
    }).catch(e => console.error('Failed to update online order', e));
  } else {
    window.DB.saveSale(sale);
  }

  // Cache receipt for printing
  localStorage.setItem(sale.id, JSON.stringify(sale));

  printReceipt(sale);

  cart = [];
  globalDiscountType = 'none';
  globalDiscountValue = 0;
  document.getElementById('orderNoteInput').value = '';
  // Reset taxes for next order? Or keep same? Keeping same is usually better UX.
  updateCartDisplay();

  // Feedback
  if (window.showToast) {
    window.showToast(t('sale_completed') || 'Sale Completed!', 'success');
  } else {
    console.log('Sale Completed');
  }

  // Optimize: Delay heavy refresh
  setTimeout(() => loadProducts(), 100);
}

// Helper: Simple Toast (if not exists globally)
window.showToast = window.showToast || function (msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed top-24 right-5 px-6 py-4 rounded-xl shadow-2xl text-white font-bold transform transition-all duration-300 translate-y-10 z-[100000] flex items-center gap-3`;
  toast.style.background = type === 'success' ? '#10B981' : '#3B82F6';
  toast.innerHTML = `<span class="material-symbols-outlined text-2xl">check_circle</span> <span>${msg}</span>`;

  document.body.appendChild(toast);

  // Animate In
  requestAnimationFrame(() => toast.style.transform = 'translateY(0)');

  // Remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
};

function processStockDeduction(productId, qtyToDeduct, sizeId) {
  const product = window.DB.getPart(productId);
  if (!product) return;

  let recipeToUse = [];
  if (sizeId && product.hasSizes) {
    const size = product.sizes.find(s => s.id == sizeId);
    recipeToUse = size ? (size.recipe || []) : [];
  } else {
    recipeToUse = product.recipe || [];
  }

  if (recipeToUse && recipeToUse.length > 0) {
    // Deduction from Ingredients
    recipeToUse.forEach(ingItem => {
      const ingredient = window.DB.getIngredient(ingItem.ingredientId);
      if (ingredient) {
        const factor = ingItem.conversionFactor || 1;
        let consumeQty = 0;

        if (ingItem.wasteType === 'fixed') {
          // Fixed Waste is usually in the Usage Unit. e.g. 5g waste on 100g usage.
          // So Gross Usage = (100 + 5) * factor = 105g * 0.001 = 0.105kg.
          consumeQty = (parseFloat(ingItem.qty) + parseFloat(ingItem.wasteValue || 0)) * qtyToDeduct * factor;
        } else {
          // Percent Waste
          const w = parseFloat(ingItem.wasteValue) || parseFloat(ingItem.wastePercent) || 0;
          if (w < 100) {
            const yieldPct = (100 - w) / 100;
            // Gross = Net / Yield. 
            // Qty is in Usage Unit.
            const grossUsageQty = parseFloat(ingItem.qty) / yieldPct;
            consumeQty = grossUsageQty * qtyToDeduct * factor;
          } else {
            // Safety
            consumeQty = parseFloat(ingItem.qty) * qtyToDeduct * factor;
          }
        }

        // Update Ingredient Stock
        const oldStock = parseFloat(ingredient.stock) || 0;
        ingredient.stock = oldStock - consumeQty;
        ingredient.lastUsedAt = new Date().toISOString(); // Track Usage for Health
        window.DB.saveIngredient(ingredient);

        // Sync with Backend
        if (window.electronAPI.updateStock) {
          window.electronAPI.updateStock(ingredient.id, ingredient.stock);
        }
      }
    });
  } else {
    // Direct Stock Deduction
    const oldStock = parseFloat(product.stock) || 0;
    product.stock = oldStock - qtyToDeduct;
    window.DB.savePart(product);

    // Sync with Backend
    if (window.electronAPI.updateStock) {
      window.electronAPI.updateStock(product.id, product.stock);
    }
  }
}

function calculateTotal(items) {
  return items.reduce((sum, i) => {
    let finalPrice = i.price;
    if (i.discount?.type === "percent") finalPrice *= (1 - i.discount.value / 100);
    else if (i.discount?.type === "value") finalPrice -= i.discount.value;
    return sum + (finalPrice * i.qty);
  }, 0);
}

// ===================== PRINT RECEIPT =====================
function printReceipt(receipt) {
  if (typeof printStoredReceipt === 'function') {
    printStoredReceipt(receipt.id);
  } else {
    alert(t('print_function_not_available') || 'Print function not available');
  }
}



window.printStoredReceipt = function (receiptId) {
  const raw = localStorage.getItem(receiptId);
  if (!raw) {
    alert(t('receipt_not_found') + ": " + receiptId);
    return;
  }
  const receipt = JSON.parse(raw);
  const products = JSON.parse(localStorage.getItem('products') || '[]');
  const shopName = localStorage.getItem('shopName') || 'My Shop';
  const shopAddress = localStorage.getItem('shopAddress') || '';
  const shopFooter = localStorage.getItem('shopFooter') || '';
  const shopLogo = localStorage.getItem('shopLogo') || '';
  const receiptFooterMessage = localStorage.getItem('footerMessage') || '';

  const lang = localStorage.getItem('pos_language') || 'en';
  // const t = ... using global t

  const paymentMap = {
    cash: t('cash'),
    card: t('card'),
    mobile: t('mobile')
  };

  let totalDiscount = 0;
  let subtotal = 0;

  const itemsHtml = receipt.items.map(item => {
    // Try to find product for name fallbacks, but prefer receipt data
    const product = products.find(p => p.code === item.code) || {};
    // Use saved values if available to ensure historical accuracy
    const price = parseFloat(item.price || 0);
    const qty = item.qty || 0;
    const originalTotal = price * qty;

    let discountStr = "-";
    let discountAmountPerUnit = 0;

    if (item.discount?.type === "percent") {
      discountAmountPerUnit = price * (item.discount.value / 100);
      discountStr = `${item.discount.value}%`;
    } else if (item.discount?.type === "value") {
      discountAmountPerUnit = item.discount.value;
      discountStr = `${discountAmountPerUnit.toFixed(2)}`;
    }

    const itemDiscountTotal = discountAmountPerUnit * qty;
    totalDiscount += itemDiscountTotal;
    subtotal += originalTotal;

    const itemName = item.sizeName ? `${item.name} (${item.sizeName})` : (item.name || product.name || '-');

    // Add-ons Text
    let addonsText = '';
    if (item.addons && item.addons.length > 0) {
      addonsText = `<div style="font-size:10px; color:#555;">+ ${item.addons.map(a => a.name).join(', ')}</div>`;
    }

    return `
      <tr>
        <td style="text-align:left;">${itemName}${addonsText}</td>
        <td>${qty}</td>
        <td>${price.toFixed(2)}</td>
        <td>${originalTotal.toFixed(2)}</td>
        <td>${discountStr}</td>
      </tr>
    `;
  }).join('');

  // Tax Breakdown HTML
  let taxesHtml = '';
  if (receipt.appliedTaxes && receipt.appliedTaxes.length > 0) {
    taxesHtml = receipt.appliedTaxes.map(tax =>
      `<p>${tax.name} (${tax.percentage}%): ${tax.amount.toFixed(2)}</p>`
    ).join('');
  } else if (receipt.tax > 0) {
    // Fallback if appliedTaxes detail is missing but tax total exists
    taxesHtml = `<p>${t('tax') || 'Tax'}: ${receipt.tax.toFixed(2)}</p>`;
  }

  // Delivery Fee HTML
  let deliveryHtml = '';
  if (receipt.deliveryFee > 0) {
    deliveryHtml = `<p>${t('delivery_fee') || 'Delivery'}: ${receipt.deliveryFee.toFixed(2)}</p>`;
  }

  const dateFormatted = new Date(receipt.date).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const html = `
    <html>
<head>
  <title>${t('receipt') || 'Receipt'}</title>
<style>
  body {
    font-family: Arial, sans-serif;
    font-size: 11.5px;
    font-weight: bold;
    line-height: 1.5;
    direction: ${lang === 'ar' ? 'rtl' : 'ltr'};
    margin: 0;
    padding: 0;
  }

  .receipt-container {
    width: 72mm;
    margin: 0;
    padding: 5px 0;
    background: #fff;
    box-sizing: border-box;
  }

  .center {
    text-align: center;
  }

  img.logo {
    max-height: 70px;
    display: block;
    margin: 0 auto 5px;
  }

  h2 {
    margin: 3px 0;
    font-size: 15px;
    font-weight: bold;
  }

  p {
    margin: 2px 8px;
    font-weight: bold;
  }

  table {
    width: 98%;
    border-collapse: collapse;
    margin: 8px auto 4px;
    table-layout: fixed;
  }

  th, td {
    border: 1px dashed #444;
    padding: 4px 5px;
    text-align: center;
    font-size: 11px;
    white-space: normal;
    word-break: break-word;
    font-weight: bold;
  }

  th:nth-child(1), td:nth-child(1) { width: 35%; text-align:left; } /* Name */
  th:nth-child(2), td:nth-child(2) { width: 12%; } /* Qty */
  th:nth-child(3), td:nth-child(3) { width: 18%; } /* Price */
  th:nth-child(4), td:nth-child(4) { width: 18%; } /* Total */
  th:nth-child(5), td:nth-child(5) { width: 17%; } /* Discount */

  .summary {
    margin: 10px 8px 0;
    font-size: 12px;
    font-weight: bold;
    border-top: 1px solid #000;
    padding-top: 5px;
  }

  .footer {
    text-align: center;
    margin: 12px 0 0;
    font-size: 10.5px;
    border-top: 1px dashed #ccc;
    padding-top: 6px;
    font-weight: bold;
  }
</style>
</head>
<body>
  <div class="receipt-container">
    ${shopLogo ? `<img src="${shopLogo}" class="logo">` : ''}
    <h2 class="center">${shopName}</h2>
    <p class="center">${shopAddress}</p>
    <hr/>
    <p>${t('receipt_no') || 'Receipt No'}: #${receipt.receiptNo || receipt.id}</p>
    <p>${t('cashier') || 'Cashier'}: ${receipt.cashier || '-'}</p>
    <p>${t('waiter') || 'Waiter'}: ${receipt.salesman || '-'}</p>
    
    ${receipt.tableId ? `<p><strong>${t('table') || 'Table'}: ${receipt.tableName}</strong></p>` : ''}
    ${receipt.customer ? `<p><strong>${t('customer') || 'Customer'}: ${receipt.customer.name}</strong></p>` : ''}
    
    <p>${t('date') || 'Date'}: ${dateFormatted}</p>
    <p>${t('method') || 'Method'}: ${paymentMap[receipt.method] || '-'}</p>

    <table>
  <thead>
    <tr>
      <th>${t('name') || 'Name'}</th>
      <th>${t('qty') || 'Qty'}</th>
      <th>${t('unit_price') || 'Price'}</th>
      <th>${t('total') || 'Total'}</th>
      <th>${t('discount') || 'Disc'}</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

    <div class="summary">
      <p style="display:flex; justify-content:space-between;"><span>${t('subtotal')}:</span> <span>${subtotal.toFixed(2)}</span></p>
      ${totalDiscount > 0 ? `<p style="display:flex; justify-content:space-between;"><span>${t('total_discounts')}:</span> <span>-${totalDiscount.toFixed(2)}</span></p>` : ''}
      
      <!-- Taxes -->
      ${taxesHtml ? `<div style="border-top:1px dashed #ccc; margin:5px 0; padding:2px 0;">${taxesHtml}</div>` : ''}
      
      <!-- Delivery Fee -->
      ${deliveryHtml ? `<div style="border-top:1px dashed #ccc; margin:5px 0; padding:2px 0;">${deliveryHtml}</div>` : ''}
      
      <p style="display:flex; justify-content:space-between; font-size:16px; margin-top:5px; border-top:2px solid #000; padding-top:2px;">
         <span>${t('total')}:</span> 
         <span>${receipt.total.toFixed(2)}</span>
      </p>
    </div>
    
    <hr/>
    ${receiptFooterMessage ? `<p class="footer" style="font-size:13px; font-weight: bold;">${receiptFooterMessage}</p>` : ''}
    <p class="footer">
      <strong>Tashgheel POS &copy; 2025</strong><br>
    </p>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
};

function confirmLogout() {
  if (confirm(t('logout_confirm'))) {
    localStorage.removeItem("pos_user");
    location.href = "index.html";
  }
}

function printDailySummary() {
  const receipts = Object.keys(localStorage)
    .filter(k => k.startsWith("receipt_"))
    .map(k => JSON.parse(localStorage.getItem(k)))
    .filter(r => r.status === "finished");

  const today = new Date().toISOString().slice(0, 10);
  const todayReceipts = receipts.filter(r => r.date.startsWith(today));

  let cash = 0, card = 0, mobile = 0, discount = 0, total = 0;

  todayReceipts.forEach(r => {
    if (r.method === "cash") cash += r.total;
    else if (r.method === "card") card += r.total;
    else if (r.method === "mobile") mobile += r.total;
    r.items.forEach(i => {
      if (i.discount) {
        if (i.discount.type === "percent") discount += (i.qty * i.price) * (i.discount.value / 100);
        else if (i.discount.type === "value") discount += i.qty * i.discount.value;
      }
    });
    total += r.total;
  });

  // 🔹 حساب المصاريف اليومية 🔹
  let expensesTotal = 0;
  for (let key in localStorage) {
    if (key.startsWith("expense_")) {
      try {
        const e = JSON.parse(localStorage.getItem(key));
        if (e.date === today) expensesTotal += parseFloat(e.amount) || 0;
      } catch { }
    }
  }

  const netAfterExpenses = total - expensesTotal;

  const lang = localStorage.getItem('pos_language') || 'en';
  // const t = ...

  const summary = `
    <html><head><title>${t('day_summary_title')}</title></head>
    <body style="font-family:monospace;font-size:14px;text-align:center;direction:${lang === 'ar' ? 'rtl' : 'ltr'}">
    <h2>${t('day_summary_title')}</h2>
    <p>${t('date')}: ${today}</p>
    <hr/>
    <p>💵 ${t('cash')}: ${cash.toFixed(2)}</p>
    <p>💳 ${t('card')}: ${card.toFixed(2)}</p>
    <p>📱 ${t('mobile')}: ${mobile.toFixed(2)}</p>
    <p>🔻 ${t('total_discounts')}: ${discount.toFixed(2)}</p>
    <p>🧾 ${t('total_expenses')}: ${expensesTotal.toFixed(2)}</p>
    <p><strong>${t('net_before_expenses') || 'Net before expenses'}: ${total.toFixed(2)}</strong></p>
    <p><strong style="color:green;">${t('net_after_expenses') || 'Net After Expenses'}: ${netAfterExpenses.toFixed(2)}</strong></p>
    <hr/>
    <script>window.onload = () => window.print()</script>
    </body></html>
  `;

  const win = window.open('', '', 'width=400,height=600');
  win.document.write(summary);
  win.document.close();
}

// ===================== SHIFT MANAGEMENT =====================
function getNextReceiptNumber() {
  let currentShift = localStorage.getItem('currentShiftId');
  if (!currentShift) {
    startNewShift(true); // Silent start
  }

  let counter = parseInt(localStorage.getItem('dailyReceiptCounter') || '0');
  counter++;
  localStorage.setItem('dailyReceiptCounter', counter);

  return String(counter).padStart(3, '0');
}

window.startNewShift = function (silent = false) {
  if (!silent && !confirm(t('confirm_start_shift') || 'Start new shift? Receipt counter will reset to 001.')) return;

  const shiftId = 'SHIFT-' + Date.now();
  localStorage.setItem('currentShiftId', shiftId);
  localStorage.setItem('dailyReceiptCounter', '0');

  if (!silent && window.showToast) {
    window.showToast(t('shift_started') || 'New Shift Started! Receipt # reset to 001.', 'success');
  }
};

// ===================== ONLINE ORDERS & PREVIEW =====================

async function fetchOnlineOrders() {
    try {
        const orders = await window.apiFetch('/kitchen/online-pending');
        const badge = document.getElementById('online-orders-badge');
        if (badge) {
            if (orders && orders.length > 0) {
                badge.textContent = orders.length;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
        window.latestOnlineOrders = orders || [];
    } catch (e) {
        console.warn('Failed to fetch online orders', e);
    }
}

function openOnlineOrders() {
    const modal = document.getElementById('onlineOrdersModal');
    const list = document.getElementById('onlineOrdersList');
    modal.style.display = 'flex';
    
    if (!window.latestOnlineOrders || window.latestOnlineOrders.length === 0) {
        list.innerHTML = `<p class="text-slate-400 text-sm py-10 text-center">No pending online orders.</p>`;
        return;
    }

    list.innerHTML = window.latestOnlineOrders.map(order => `
        <div class="p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center group">
            <div>
                <div class="font-bold text-sm">#${order.receiptNo} — ${order.customer?.name || 'Guest'}</div>
                <div class="text-[10px] text-slate-500">${order.orderType.toUpperCase()} | ${new Date(order.date).toLocaleTimeString()}</div>
                <div class="text-[11px] font-bold text-success mt-1">${parseFloat(order.total || 0).toFixed(2)} EGP</div>
            </div>
            <button onclick="resumeOnlineOrder('${order.id}')" 
                class="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                Resume
            </button>
        </div>
    `).join('');
}

function resumeOnlineOrder(orderId) {
    const order = window.latestOnlineOrders.find(o => o.id === orderId);
    if (!order) return;

    if (cart.length > 0 && !confirm('Resume online order? Current cart will be cleared.')) return;

    cart = order.items.map(i => ({
        product_id: i.productId,
        code: i.productCode,
        name: i.name,
        sizeName: i.sizeName || '',
        price: i.price,
        qty: i.qty,
        cost: i.cost || 0,
        note: i.note || '',
        addons: i.addons || []
    }));

    currentOnlineOrderId = order.id;
    
    // Set Order Type
    const radios = document.querySelectorAll('input[name="orderType"]');
    radios.forEach(r => {
        if (r.value === order.orderType) r.checked = true;
    });
    if (typeof toggleOrderType === 'function') toggleOrderType();

    // Set Customer Info if Delivery
    if (order.orderType === 'delivery' && order.customer) {
        // Mocking selection for simplicity
        currentCustomer = { 
            id: order.customer.mobile, 
            name: order.customer.name, 
            mobile: order.customer.mobile 
        };
        selectedAddress = order.customer.address;
        const selDisp = document.getElementById('selectedCustomerDisplay');
        if (selDisp) {
            selDisp.style.display = 'block';
            document.getElementById('selCustName').textContent = currentCustomer.name;
            document.getElementById('selCustMobile').textContent = currentCustomer.mobile;
        }
    }

    updateCartDisplay();
    document.getElementById('onlineOrdersModal').style.display = 'none';
}

function printReceiptPreview() {
    if (cart.length === 0) return alert('Cart is empty');

    // Simple temporary object for printing
    const previewSale = {
        receiptNo: 'PREVIEW',
        date: new Date().toISOString(),
        items: cart,
        total: parseFloat(document.getElementById('cartTotal').textContent.split(': ')[1]) || 0,
        subtotal: parseFloat(document.getElementById('cartSubtotal').textContent) || 0,
        discount: parseFloat(document.getElementById('cartDiscount').textContent.replace('- ', '')) || 0,
        cashier: (window.getCurrentUser ? window.getCurrentUser().username : 'Staff'),
        orderType: document.querySelector('input[name="orderType"]:checked')?.value || 'take_away'
    };

    // Use existing print stored receipt if possible
    const tempId = 'preview_receipt';
    localStorage.setItem(tempId, JSON.stringify(previewSale));
    
    if (typeof window.printStoredReceipt === 'function') {
        window.printStoredReceipt(tempId);
    } else {
        alert('Print engine not found.');
    }
}

async function sendToKitchen() {
    if (cart.length === 0) return alert('Cart is empty');

    if (currentOnlineOrderId) {
        try {
            const res = await window.apiFetch(`/kitchen/preparing/${currentOnlineOrderId}`, {
                method: 'POST'
            });
            if (res.success) {
                window.showToast('Order sent to kitchen!', 'success');
            }
        } catch (e) {
            alert('Failed to send to kitchen: ' + e.message);
        }
    } else {
        alert('Independent KOT for regular orders is coming soon. Please use Hold for now.');
    }
}

window.openOnlineOrders = openOnlineOrders;
window.resumeOnlineOrder = resumeOnlineOrder;
window.printReceiptPreview = printReceiptPreview;
window.sendToKitchen = sendToKitchen;
window.fetchOnlineOrders = fetchOnlineOrders;

window.addEventListener('SystemDataReady', () => {
  loadProducts();
  loadSalesmen();
  loadTables();
  checkShift();
  if (window.getCurrentUser) {
    const user = window.getCurrentUser();
    if (user && user.username) {
      const nameEl = document.getElementById('currentUserName');
      if (nameEl) nameEl.textContent = user.username;
    }
  }
  fetchOnlineOrders();
});
