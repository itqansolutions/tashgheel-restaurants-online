// POS JS with salesman support and fixed receipt printing (final version)
let allProducts = [];
let filteredProducts = [];
let cart = [];
let currentDiscountIndex = null;

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
  toggleOrderType(); // Set initial state
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
  printDailySummary();
  document.getElementById('closeDayModal').style.display = 'flex';
};

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
    btn.className = `btn btn-sm ${currentCategory === cat ? 'btn-primary' : 'btn-outline-primary'}`;
    btn.textContent = cat === 'All' ? (t('all') || 'All') : cat;
    btn.style.borderRadius = '20px';
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
    card.className = "product-card";

    // Determine Price Display
    let priceDisplay = product.price;
    if (product.hasSizes && product.sizes && product.sizes.length > 0) {
      const prices = product.sizes.map(s => s.price);
      const minPrice = Math.min(...prices);
      priceDisplay = `${minPrice}+`; // classic "Starting at" display
    }

    const imgHtml = product.image
      ? `<img src="${product.image}" alt="${product.name}" onerror="this.style.display='none'">`
      : `<div class="no-image">📦</div>`;

    card.innerHTML = `
      ${imgHtml}
      <h4>${product.name}</h4>
      <p class="price">${priceDisplay}</p>
      <p class="stock" style="font-size:0.8rem; color:${(product.stock || 0) <= 5 ? 'red' : 'green'}">
         ${(product.hasSizes || (product.recipe && product.recipe.length > 0)) ? '' : (t('stock') + ': ' + (product.stock || 0))}
      </p>
    `;
    card.onclick = () => addToCart(product);
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

function loadTables() {
  const tables = window.DB.getTables();
  const select = document.getElementById("tableSelection")?.querySelector("select");
  if (!select) return;
  select.innerHTML = `<option value="">-- ${t('select_table') || 'Select Table'} --</option>`;
  tables.forEach(table => {
    const opt = document.createElement("option");
    opt.value = table.id;
    opt.textContent = table.name;
    select.appendChild(opt);
  });
}

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
  } else if (type === 'delivery') {
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
};
// ===================== DELIVERY CUSTOMER LOGIC =====================
let currentCustomer = null;
let selectedAddress = null;
let currentDeliveryFee = 0;

function searchCustomerPos() {
  const q = document.getElementById('custSearchPos').value.trim().toLowerCase();
  if (!q) return;

  const allCustomers = window.DB.getCustomers();
  // Fuzzy search
  const found = allCustomers.find(c => c.mobile.includes(q) || c.name.toLowerCase().includes(q));

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

function saveQuickCustomer() {
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
    id: Date.now(),
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

  window.DB.saveCustomer(newCust); // Assumes DB.saveCustomer exists and works
  document.getElementById('quickCustomerModal').style.display = 'none';
  selectCustomer(newCust);
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

function saveCheckCustomerAddress() {
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

  window.DB.saveCustomer(currentCustomer);

  // Refresh list
  selectCustomer(currentCustomer);

  // Select the new one
  const select = document.getElementById('custAddressSelect');
  select.value = currentCustomer.addresses.length - 1;
  selectedAddress = addr;

  document.getElementById('addressModal').style.display = 'none';
}

// ===================== DISCOUNT MODAL =====================
function openDiscountModal(index) {
  currentDiscountIndex = index;
  const item = cart[index];
  document.getElementById('discountType').value = item.discount?.type || 'none';
  document.getElementById('discountValue').value = item.discount?.value || 0;
  document.getElementById('discountModal').style.display = 'flex';
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
    allowedItems = allParts.filter(p => ['Add-ons', 'Extras', 'Addons'].includes(p.category));
  } else {
    allowedItems = allParts.filter(p => product.allowedAddons.includes(p.id));
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
  const id = parseInt(cb.value);
  const price = parseFloat(cb.dataset.price);
  const name = cb.dataset.name;

  if (cb.checked) {
    selectedAddons.push({ id, name, price, qty: 1 });
  } else {
    selectedAddons = selectedAddons.filter(a => a.id !== id);
  }
}

function confirmAddons() {
  if (pendingProduct) {
    // Validation: If has sizes, must select size
    if (pendingProduct.hasSizes && !selectedSize) {
      alert('Please select a size first.');
      return;
    }

    addItemToCartFinal(pendingProduct, selectedAddons, selectedSize);
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

function addItemToCartFinal(product, addons = [], sizeObj = null) {
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
      sizeId: sizeObj ? sizeObj.id : null
    });
  }

  updateCartDisplay();
}

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
    let finalPrice = item.price;

    if (item.discount?.type === "percent") {
      finalPrice *= (1 - item.discount.value / 100);
      discountText = ` (-${item.discount.value}%)`;
    } else if (item.discount?.type === "value") {
      finalPrice -= item.discount.value;
      discountText = ` (-${item.discount.value})`; // Currency handled in summary
    }

    const div = document.createElement("div");
    div.className = "cart-item";

    let addonsHtml = '';
    if (item.addons && item.addons.length > 0) {
      addonsHtml = `<div style="font-size:0.85em; color:#666; padding-left:10px;">` +
        item.addons.map(a => `+ ${a.name}`).join('<br>') +
        `</div>`;
    }

    // Display Size if exists
    const displayName = item.sizeName ? `${item.name} (${item.sizeName})` : item.name;

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; width:100%;">
        <div>
          <span>${displayName} x${item.qty} ${discountText}</span>
          ${addonsHtml}
        </div>
        <div>
           <span>${(finalPrice * item.qty).toFixed(2)}</span>
           <button onclick="openDiscountModal(${index})" title="${t('discount')}">💸</button>
           <button onclick="removeFromCart(${index})" style="color:red; margin-left:5px;">x</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });

  toggleCartButtons(true);
  updateCartSummary();
}

function updateCartSummary() {
  let subtotal = 0;
  let discountTotal = 0;

  cart.forEach(item => {
    let itemTotal = item.qty * item.price;
    let discount = 0;

    if (item.discount) {
      if (item.discount.type === "percent") {
        discount = itemTotal * (item.discount.value / 100);
      } else if (item.discount.type === "value") {
        discount = item.discount.value;
      }
    }

    subtotal += itemTotal;
    discountTotal += discount;
  });

  const total = subtotal - discountTotal;

  // Calculate Grand Total including Tax and Delivery
  const tax = 0; // Tax 0% for now
  const fee = (typeof currentDeliveryFee !== 'undefined') ? currentDeliveryFee : 0;
  const grandTotal = total + tax + fee;

  // Render
  document.getElementById("cartSubtotal").textContent = subtotal.toFixed(2);
  document.getElementById("cartDiscount").textContent = `- ${discountTotal.toFixed(2)}`;
  document.getElementById("cartTax").textContent = tax.toFixed(2);

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

  document.getElementById("subtotalLabel").textContent = t('subtotal');
  document.getElementById("discountLabel").textContent = t('discount');
  document.getElementById("taxLabel").textContent = t('tax');
  document.getElementById("cartCounter").textContent = cart.length;
}

function toggleCartButtons(enable) {
  ["cashBtn", "cardBtn", "mobileBtn", "holdBtn", "clearCartBtn"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !enable;
  });
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartDisplay();
}
window.removeFromCart = removeFromCart;

function clearCart() {
  if (cart.length > 0 && confirm(t('confirm_clear_cart'))) {
    cart = [];
    updateCartDisplay();
  } else if (cart.length === 0) {
    cart = []; // Just to be safe or if forceful
    updateCartDisplay();
  }
}

// ===================== SALE =====================
function getProductCost(code) {
  const product = allProducts.find(p => p.code === code);
  return product?.cost || 0;
}

function processSale(method) {
  if (cart.length === 0) return;

  const orderType = document.querySelector('input[name="orderType"]:checked')?.value || 'take_away';
  const salesmanSelect = document.getElementById('salesmanSelect');
  const salesman = salesmanSelect?.value || ''; // Can be empty if not selected
  const tableSelect = document.getElementById('tableSelect');
  const tableId = tableSelect?.value || null;
  const tableName = tableId ? tableSelect.options[tableSelect.selectedIndex].text : null;

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
      // Optional: force address? Yes for delivery.
      alert('Please select a Delivery Address.');
      return;
    }
  }

  const currentUser = getCurrentUser();

  // Resolve Cashier Name from Employee Link
  let cashierName = currentUser.username || "Unknown";
  if (window.DB.getEmployees) {
    const employees = window.DB.getEmployees();
    const linkedEmp = employees.find(e => e.linkedUser === currentUser.username);
    if (linkedEmp) {
      cashierName = linkedEmp.name; // Use Employee Name
    }
  }

  // Recalculate totals one last time to be safe
  const subtotal = calculateTotal(cart);
  const discountAmount = cart.reduce((acc, item) => {
    if (item.discount?.type === 'value') return acc + item.discount.value;
    if (item.discount?.type === 'percent') return acc + (item.price * item.qty * item.discount.value / 100);
    return acc;
  }, 0);

  const tax = 0;
  const fee = (orderType === 'delivery' && typeof currentDeliveryFee !== 'undefined') ? currentDeliveryFee : 0;
  const grandTotal = subtotal + tax + fee;

  const sale = {
    id: "REC-" + Date.now(),
    date: new Date().toISOString(),
    method: method,
    orderType: orderType,
    tableId: tableId,
    tableName: tableName,
    cashier: cashierName, // Resolved Name
    salesman: salesman, // Waiter or Salesman
    status: "finished",
    total: grandTotal,
    subtotal: subtotal,
    discount: discountAmount,
    deliveryFee: fee, // SAVED
    customer: (orderType === 'delivery' && currentCustomer) ? {
      id: currentCustomer.id,
      name: currentCustomer.name,
      mobile: currentCustomer.mobile,
      address: selectedAddress
    } : null,
    items: cart.map(item => ({
      id: item.id,
      code: item.partNumber || item.code, // adaptation
      name: item.name,
      qty: item.qty,
      price: item.price,
      cost: item.cost, // Calculated Cost
      discount: item.discount
    }))
  };

  // Stock Deduction Logic
  cart.forEach(item => {
    // 1. Deduct Main Item
    processStockDeduction(item.product_id, item.qty, item.sizeId);

    // 2. Deduct Add-ons
    if (item.addons && item.addons.length > 0) {
      item.addons.forEach(addon => {
        // Addons are also Products/Parts
        // We assume 1 qty of addon per parent item qty? Or defined in selection?
        // Logic above set qty:1 per selection.
        // If I buy 2 Burgers, and selected "Extra Cheese", I expect 2 Extra Cheeses?
        // CURRENT IMPLEMENTATION: item.addons is the CONFIGURATION for a single unit of item.
        // So for "Burger x 2" with "Extra Cheese", we need to deduct 2 Extra Cheeses.

        processStockDeduction(addon.id, item.qty * addon.qty, null);
      });
    }
  });

  // Save Sale
  window.DB.saveSale(sale);
  printReceipt(sale);

  cart = [];
  updateCartDisplay();

  // Refresh generic views
  alert(t('sale_completed') || 'Sale Completed!');
  loadProducts(); // Refresh in case stock changed (for Direct items)
}

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
        ingredient.stock = (parseFloat(ingredient.stock) || 0) - consumeQty;
        window.DB.saveIngredient(ingredient);
      }
    });
  } else {
    // Direct Stock Deduction
    product.stock = (parseFloat(product.stock) || 0) - qtyToDeduct;
    window.DB.savePart(product);
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

function getCurrentUser() {
  return JSON.parse(localStorage.getItem("currentUser") || '{"username":"User"}');
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
    const product = products.find(p => p.code === item.code) || {};
    const originalTotal = item.price * item.qty;
    let discountStr = "-";
    let discountAmountPerUnit = 0;

    if (item.discount?.type === "percent") {
      discountAmountPerUnit = item.price * (item.discount.value / 100);
      discountStr = `${item.discount.value}%`;
    } else if (item.discount?.type === "value") {
      discountAmountPerUnit = item.discount.value;
      discountStr = `${discountAmountPerUnit.toFixed(2)}`;
    }

    const itemDiscountTotal = discountAmountPerUnit * item.qty;
    totalDiscount += itemDiscountTotal;
    subtotal += originalTotal;

    return `
      <tr>
        <td>${item.code}</td>
        <td>${product.name || item.name || '-'}</td>
        <td>${item.qty}</td>
        <td>${item.price.toFixed(2)}</td>
        <td>${originalTotal.toFixed(2)}</td>
        <td>${discountStr}</td>
      </tr>
    `;
  }).join('');

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
    line-height: 1.7;
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

  th:nth-child(1), td:nth-child(1) { width: 14%; } /* Code */
  th:nth-child(2), td:nth-child(2) { width: 28%; } /* Name */
  th:nth-child(3), td:nth-child(3) { width: 10%; } /* Qty */
  th:nth-child(4), td:nth-child(4) { width: 14%; } /* Price */
  th:nth-child(5), td:nth-child(5) { width: 16%; } /* Total */
  th:nth-child(6), td:nth-child(6) { width: 18%; } /* Discount */

  .summary {
    margin: 10px 8px 0;
    font-size: 12px;
    font-weight: bold;
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
    <p>${t('receipt_no') || 'Receipt No'}: ${receipt.id}</p>
    <p>${t('cashier') || 'Cashier'}: ${receipt.cashier}</p>
    <p>${t('cashier') || 'Cashier'}: ${receipt.cashier}</p>
    <p>${receipt.orderType === 'dine_in' ? (t('waiter') || 'Waiter') :
      receipt.orderType === 'delivery' ? (t('delivery_man') || 'Delivery Man') :
        (t('salesman') || 'Salesman')
    }: ${receipt.salesman || '-'}</p>
    <p><strong>${t('order_type') || 'Type'}: ${t(receipt.orderType) || receipt.orderType}</strong></p>
    ${receipt.tableId ? `<p><strong>${t('table') || 'Table'}: ${receipt.tableName}</strong></p>` : ''}
    <p>${t('date') || 'Date'}: ${dateFormatted}</p>
    <p>${t('method') || 'Method'}: ${paymentMap[receipt.method] || '-'}</p>

    <table>
  <thead>
    <tr>
      <th>${t('code') || 'Code'}</th>
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
      <p>${t('subtotal')}: ${subtotal.toFixed(2)}</p>
      <p>${t('total_discounts')}: ${totalDiscount.toFixed(2)}</p>
      <p>${t('total')}: ${receipt.total.toFixed(2)}</p>
    </div>
    <hr/>
    ${receiptFooterMessage ? `<p class="footer" style="font-size:13px; font-weight: bold;">${receiptFooterMessage}</p>` : ''}
    <p class="footer">
      <strong>Tashgheel POS &copy; 2025</strong><br>
      <span id="footerText">${t('enhanced_security')}</span>
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
