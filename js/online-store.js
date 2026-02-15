/**
 * Online Store Logic
 * Handles public API interaction, Cart State, and Checkout
 */

// State
let state = {
    branch: null,
    menu: { categories: [], products: [] },
    cart: [],
    zones: [],
    deliveryZone: null // Selected Zone Object
};

// Config
const API_BASE = '/api/public';

// Init
document.addEventListener('DOMContentLoaded', () => {
    // 1. Capture Tenant ID from URL (oid = Obfuscated ID / Organization ID)
    const urlParams = new URLSearchParams(window.location.search);
    const tenantId = urlParams.get('oid');

    if (tenantId) {
        sessionStorage.setItem('online_tenant_id', tenantId);
        // clean URL - REMOVED to keep the link valid for sharing/bookmarking
        // window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 2. Load App
    loadCart();
    checkBranchSelection();
});

// Helper to get current Tenant ID
function getTenantId() {
    return sessionStorage.getItem('online_tenant_id');
}

// --- BRANCH MANAGEMENT ---

async function checkBranchSelection() {
    const tenantId = getTenantId();
    if (!tenantId) {
        document.body.innerHTML = `
            <div class="fixed inset-0 flex items-center justify-center bg-slate-50 p-4 text-center">
                <div class="max-w-md">
                    <span class="material-symbols-rounded text-6xl text-slate-300 mb-4">link_off</span>
                    <h1 class="text-xl font-bold text-slate-800 mb-2">Invalid Store Link</h1>
                    <p class="text-slate-500">Please use the valid link provided by the restaurant.</p>
                </div>
            </div>
        `;
        return;
    }

    const savedBranch = sessionStorage.getItem('online_branch');
    if (savedBranch) {
        state.branch = JSON.parse(savedBranch);
        // Verify branch belongs to current tenant (basic check)
        if (state.branch.tenantId && state.branch.tenantId !== tenantId) {
            sessionStorage.removeItem('online_branch');
            window.location.reload();
            return;
        }
        updateUIForBranch();
        loadMenu(state.branch._id);
    } else {
        openBranchModal();
        fetchBranches();
    }
}

async function fetchBranches() {
    const container = document.getElementById('branchList');
    container.innerHTML = '<div class="p-4 text-center text-slate-400">Loading branches...</div>';

    try {
        const tenantId = getTenantId();
        const res = await fetch(`${API_BASE}/branches`, {
            headers: { 'x-tenant-id': tenantId }
        });

        if (!res.ok) throw new Error('Failed to load');

        const branches = await res.json();

        container.innerHTML = '';
        if (branches.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-slate-500">No active branches found.</div>';
            return;
        }

        branches.forEach(b => {
            const div = document.createElement('div');
            div.className = 'p-4 border border-slate-100 rounded-xl mb-3 hover:border-blue-200 hover:bg-blue-50 cursor-pointer transition-all group flex justify-between items-center';
            div.onclick = () => selectBranch(b);

            div.innerHTML = `
                <div>
                    <div class="font-bold text-slate-800 group-hover:text-blue-700">${b.name}</div>
                    <div class="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <span class="material-symbols-rounded text-[14px]">location_on</span>
                        ${b.address || 'Address not available'}
                    </div>
                </div>
                <span class="material-symbols-rounded text-slate-300 group-hover:text-blue-500">arrow_forward_ios</span>
            `;
            container.appendChild(div);
        });

    } catch (e) {
        container.innerHTML = '<div class="text-red-500 text-center p-4">Failed to load branches.</div>';
    }
}

function selectBranch(branch) {
    state.branch = branch;
    sessionStorage.setItem('online_branch', JSON.stringify(branch));
    toggleBranchModal(false);
    updateUIForBranch();
    loadMenu(branch._id);
    loadDeliveryZones(branch._id);

    // Clear cart if branch changes? Optional. For now, we clear to avoid price mismatch.
    if (state.cart.length > 0) {
        if (confirm('Changing branch will clear your cart. Continue?')) {
            clearCart();
        } else {
            // Revert?
            return;
        }
    }
}

function updateUIForBranch() {
    document.getElementById('currentBranchName').textContent = state.branch.name;
    document.getElementById('productsGrid').innerHTML = '<div class="col-span-full py-20 text-center"><div class="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div><p class="text-slate-400">Loading Menu...</p></div>';
}

function openBranchModal() { toggleBranchModal(true); fetchBranches(); }
function toggleBranchModal(show) {
    const modal = document.getElementById('branchModal');
    if (show === undefined) modal.classList.toggle('hidden');
    else if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');

    if (show) modal.classList.add('flex');
    else modal.classList.remove('flex');
}

// --- MENU & PRODUCTS ---

async function loadMenu(branchId) {
    try {
        const res = await fetch(`${API_BASE}/menu/${branchId}`);
        const data = await res.json(); // { categories, products }

        state.menu = data;
        renderCategories();
        renderProducts();

    } catch (e) {
        console.error(e);
        document.getElementById('productsGrid').innerHTML = '<div class="col-span-full text-center text-red-500 py-10">Failed to load menu.</div>';
    }
}

function renderCategories() {
    const container = document.getElementById('categoriesContainer');
    container.innerHTML = `
        <button onclick="filterCategory('all')" class="cat-pill active px-5 py-2 rounded-full bg-slate-900 text-white text-sm font-bold whitespace-nowrap shadow-md transition-transform hover:scale-105">
            All Items
        </button>
    `;

    state.menu.categories.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'cat-pill px-5 py-2 rounded-full bg-white text-slate-600 border border-slate-200 text-sm font-bold whitespace-nowrap hover:border-slate-300 hover:bg-slate-50 transition-all';
        btn.textContent = c.name;
        btn.onclick = (e) => {
            document.querySelectorAll('.cat-pill').forEach(el => {
                el.className = 'cat-pill px-5 py-2 rounded-full bg-white text-slate-600 border border-slate-200 text-sm font-bold whitespace-nowrap hover:border-slate-300 hover:bg-slate-50 transition-all';
            });
            e.target.className = 'cat-pill active px-5 py-2 rounded-full bg-slate-900 text-white text-sm font-bold whitespace-nowrap shadow-md transition-transform hover:scale-105';
            filterCategory(c._id);
        };
        container.appendChild(btn);
    });
}

function filterCategory(catId) {
    const products = catId === 'all'
        ? state.menu.products
        : state.menu.products.filter(p => p.category === catId);
    renderProducts(products);
}

function renderProducts(products = state.menu.products) {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';

    if (products.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-20 text-slate-400">No items found in this category.</div>';
        return;
    }

    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer';
        card.onclick = () => openProductModal(p);

        const imgUrl = p.image || 'https://placehold.co/400x300/f1f5f9/94a3b8?text=No+Image';

        card.innerHTML = `
            <div class="h-48 overflow-hidden relative">
                <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
                <div class="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-lg text-sm font-bold text-slate-900 shadow-sm">
                    ${p.price} EGP
                </div>
            </div>
            <div class="p-5">
                <h3 class="font-bold text-slate-900 text-lg mb-1 group-hover:text-blue-600 transition-colors">${p.name}</h3>
                <p class="text-slate-500 text-sm line-clamp-2 leading-relaxed">${p.description || 'Delicious meal prepared fresh.'}</p>
                
                <button class="mt-4 w-full py-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 font-bold rounded-lg text-sm transition-colors border border-slate-100 hover:border-blue-100">
                    Add to Cart
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- PRODUCT DETAILS MODAL ---

let currentProduct = null;
let currentQty = 1;

function openProductModal(product) {
    currentProduct = product;
    currentQty = 1;

    document.getElementById('modalTitle').textContent = product.name;
    document.getElementById('modalDesc').textContent = product.description || '';
    document.getElementById('modalPrice').textContent = `${product.price} EGP`;
    document.getElementById('modalImg').src = product.image || 'https://placehold.co/400x300/f1f5f9/94a3b8?text=No+Image';
    document.getElementById('modalNote').value = '';

    updateModalQty();

    const modal = document.getElementById('productModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeProductModal() {
    document.getElementById('productModal').classList.add('hidden');
    document.getElementById('productModal').classList.remove('flex');
}

function adjustQty(delta) {
    const newQty = currentQty + delta;
    if (newQty >= 1) {
        currentQty = newQty;
        updateModalQty();
    }
}

function updateModalQty() {
    document.getElementById('modalQty').textContent = currentQty;
    const total = (currentProduct.price * currentQty).toFixed(2);
    document.getElementById('modalBtnTotal').textContent = `${total} EGP`;
}

function addToCart() {
    if (!currentProduct) return;

    const existingIndex = state.cart.findIndex(i => i.id === currentProduct._id && i.note === document.getElementById('modalNote').value);

    if (existingIndex > -1) {
        state.cart[existingIndex].qty += currentQty;
    } else {
        state.cart.push({
            id: currentProduct._id,
            name: currentProduct.name,
            price: currentProduct.price,
            qty: currentQty,
            note: document.getElementById('modalNote').value
        });
    }

    saveCart();
    closeProductModal();
    openCart(); // Auto open cart for feedback
}

// --- CART LOGIC ---

function loadCart() {
    const saved = localStorage.getItem('online_cart');
    if (saved) state.cart = JSON.parse(saved);
    updateCartUI();
}

function saveCart() {
    localStorage.setItem('online_cart', JSON.stringify(state.cart));
    updateCartUI();
}

function clearCart() {
    state.cart = [];
    saveCart();
}

function updateCartUI() {
    // Badge
    const count = state.cart.reduce((sum, i) => sum + i.qty, 0);
    const badge = document.getElementById('cartCountBadge');
    badge.textContent = count;
    badge.classList.toggle('scale-0', count === 0);

    document.getElementById('cartCountHeader').textContent = count;

    // Items
    const container = document.getElementById('cartItems');
    container.innerHTML = '';

    let subtotal = 0;

    if (count === 0) {
        container.innerHTML = `
            <div class="text-center py-20">
                <img src="https://cdni.iconscout.com/illustration/premium/thumb/empty-cart-2130356-1800917.png" alt="Empty Cart" class="w-40 mx-auto opacity-50 mb-4 grayscale">
                <p class="text-slate-400 font-medium">Your cart is empty</p>
                <button onclick="closeCart()" class="mt-4 text-blue-600 font-bold text-sm hover:underline">Browse Menu</button>
            </div>
        `;
        document.getElementById('cartFooter').classList.add('hidden');
    } else {
        state.cart.forEach((item, index) => {
            const itemTotal = item.price * item.qty;
            subtotal += itemTotal;

            const div = document.createElement('div');
            div.className = 'flex gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100';
            div.innerHTML = `
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-1">
                        <span class="font-bold text-slate-800 text-sm line-clamp-1">${item.name}</span>
                        <span class="font-bold text-slate-900 text-sm">${itemTotal.toFixed(2)}</span>
                    </div>
                    ${item.note ? `<div class="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mb-2 inline-block">${item.note}</div>` : ''}
                    
                    <div class="flex items-center gap-3">
                        <div class="flex items-center bg-white border border-slate-200 rounded-lg px-1 h-7">
                            <button onclick="updateCartItem(${index}, -1)" class="w-6 h-full text-slate-500 hover:text-blue-600 font-bold">-</button>
                            <span class="w-6 text-center text-xs font-bold">${item.qty}</span>
                            <button onclick="updateCartItem(${index}, 1)" class="w-6 h-full text-slate-500 hover:text-blue-600 font-bold">+</button>
                        </div>
                        <button onclick="removeFromCart(${index})" class="text-xs text-slate-400 hover:text-red-500 underline decoration-dotted">Remove</button>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

        // Footer Calcs
        const taxRate = state.branch?.settings?.taxRate || 0;
        const taxVal = subtotal * (taxRate / 100);

        document.getElementById('cartSubtotal').textContent = subtotal.toFixed(2);
        document.getElementById('cartTax').textContent = `${taxVal.toFixed(2)} (${taxRate}%)`;
        document.getElementById('cartTotal').textContent = (subtotal + taxVal).toFixed(2);

        document.getElementById('cartFooter').classList.remove('hidden');
    }
}

function updateCartItem(index, delta) {
    state.cart[index].qty += delta;
    if (state.cart[index].qty <= 0) state.cart.splice(index, 1);
    saveCart();
}

function removeFromCart(index) {
    state.cart.splice(index, 1);
    saveCart();
}

function openCart() {
    const sidebar = document.getElementById('cartSidebar');
    sidebar.classList.remove('translate-x-full');
}

function closeCart() {
    const sidebar = document.getElementById('cartSidebar');
    sidebar.classList.add('translate-x-full');
}

// --- DELIVERY ZONES ---

async function loadDeliveryZones(branchId) {
    try {
        // We pass branchId in case zones are branch-specific, though our model supports global too
        const res = await fetch(`${API_BASE}/delivery-zones?branchId=${branchId}`);
        state.zones = await res.json();
    } catch (e) { }
}

// --- CHECKOUT ---

function openCheckout() {
    closeCart();

    // Populate Zones
    const select = document.getElementById('deliveryZone');
    select.innerHTML = '<option value="">Select Area...</option>';
    state.zones.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z._id;
        opt.textContent = `${z.name} - ${z.fee} EGP Delivery`;
        select.appendChild(opt);
    });

    updateCheckoutSummary();

    document.getElementById('checkoutModal').classList.remove('hidden');
    document.getElementById('checkoutModal').classList.add('flex');
}

function closeCheckout() {
    document.getElementById('checkoutModal').classList.add('hidden');
    document.getElementById('checkoutModal').classList.remove('flex');
}

function toggleDeliveryFields() {
    const type = document.querySelector('input[name="orderType"]:checked').value;
    const fields = document.getElementById('deliveryFields');
    const deliveryRow = document.getElementById('checkoutDeliveryRow');
    const zoneSelect = document.getElementById('deliveryZone');

    if (type === 'delivery') {
        fields.classList.remove('hidden');
        deliveryRow.classList.remove('hidden');
        zoneSelect.setAttribute('required', 'true');
        document.getElementById('addrStreet').setAttribute('required', 'true');
    } else {
        fields.classList.add('hidden');
        deliveryRow.classList.add('hidden');
        zoneSelect.removeAttribute('required');
        document.getElementById('addrStreet').removeAttribute('required');

        // Reset Zone Selection
        state.deliveryZone = null;
        zoneSelect.value = '';
    }
    updateCheckoutSummary();
}

document.getElementById('deliveryZone').addEventListener('change', (e) => {
    const zoneId = e.target.value;
    state.deliveryZone = state.zones.find(z => z._id === zoneId);
    updateCheckoutSummary();
});

function updateCheckoutSummary() {
    let subtotal = 0;
    state.cart.forEach(i => subtotal += i.price * i.qty);

    const taxRate = state.branch?.settings?.taxRate || 0;
    const taxVal = subtotal * (taxRate / 100);

    let deliveryFee = 0;
    if (state.deliveryZone) {
        deliveryFee = state.deliveryZone.fee;
    }

    const total = subtotal + taxVal + deliveryFee;

    document.getElementById('checkoutSubtotal').textContent = `${subtotal.toFixed(2)} + ${taxVal.toFixed(2)} Tax`;
    document.getElementById('checkoutDeliveryFee').textContent = deliveryFee.toFixed(2);
    document.getElementById('checkoutTotal').textContent = `${total.toFixed(2)} EGP`;
}

async function submitOrder(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('placeOrderBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div> Processing...';

    const orderType = document.querySelector('input[name="orderType"]:checked').value;
    const customer = {
        name: document.getElementById('custName').value,
        mobile: document.getElementById('custPhone').value,
        address: orderType === 'delivery' ? {
            area: state.deliveryZone?.name || 'Unknown',
            street: document.getElementById('addrStreet').value,
            building: document.getElementById('addrBuilding').value
        } : null
    };

    const payload = {
        branchId: state.branch._id,
        cart: state.cart,
        customer,
        orderType,
        deliveryZoneId: state.deliveryZone?._id
    };

    try {
        const res = await fetch(`${API_BASE}/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok && result.success) {
            // Success
            state.cart = [];
            saveCart();
            closeCheckout();

            document.getElementById('successOrderId').textContent = `#${result.orderId.slice(-6).toUpperCase()}`;
            document.getElementById('successModal').classList.remove('hidden');
            document.getElementById('successModal').classList.add('flex');
        } else {
            alert('Order Failed: ' + (result.error || 'Unknown Error'));
            submitBtn.disabled = false;
            submitBtn.textContent = 'Place Order';
        }
    } catch (err) {
        console.error(err);
        alert('Network Error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Place Order';
    }
}


// --- ORDER TRACKING ---

function openOrdersModal() {
    // Auto-fill mobile if available
    const savedMobile = localStorage.getItem('last_customer_mobile');
    const input = document.getElementById('trackMobile');
    if (savedMobile) {
        input.value = savedMobile;
        fetchOrders();
    }

    document.getElementById('ordersModal').classList.remove('hidden');
    document.getElementById('ordersModal').classList.add('flex');
}

function closeOrdersModal() {
    document.getElementById('ordersModal').classList.add('hidden');
    document.getElementById('ordersModal').classList.remove('flex');
}

async function fetchOrders() {
    const mobile = document.getElementById('trackMobile').value.trim();
    const container = document.getElementById('ordersList');

    if (!mobile) return alert('Please enter mobile number');

    // Save for next time
    localStorage.setItem('last_customer_mobile', mobile);

    container.innerHTML = '<div class="text-center py-10"><div class="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div><p class="text-slate-400">Loading History...</p></div>';

    try {
        const tenantId = getTenantId();
        const res = await fetch(`${API_BASE}/orders?mobile=${mobile}&tenantId=${tenantId}`);
        const orders = await res.json();

        container.innerHTML = '';
        if (orders.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10 opacity-50">
                    <span class="material-symbols-rounded text-4xl mb-2 text-slate-300">receipt_long</span>
                    <p class="text-slate-400 text-sm">No orders found for this number</p>
                </div>`;
            return;
        }

        orders.forEach(order => {
            const statusObj = mapOrderStatus(order);
            const date = new Date(order.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            const div = document.createElement('div');
            div.className = 'bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow';
            div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="font-bold text-slate-800 text-sm">Order #${order.receiptNo || 'N/A'}</div>
                        <div class="text-xs text-slate-400">${date}</div>
                    </div>
                    <span class="px-2 py-1 rounded-lg text-xs font-bold ${statusObj.bg} ${statusObj.color}">
                        ${statusObj.label}
                    </span>
                </div>
                <div class="text-sm text-slate-600 mb-2 line-clamp-1">
                    ${order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                </div>
                <div class="flex justify-between items-center text-sm">
                    <div class="font-bold text-slate-900">${(order.total || 0).toFixed(2)} EGP</div>
                    <button class="text-xs text-blue-600 hover:underline">Details</button>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-center text-red-500 py-4">Failed to load orders</div>';
    }
}

function mapOrderStatus(order) {
    // Logic to map backend status to UI friendly status
    const s = (order.status || '').toLowerCase();
    const ks = (order.kitchenStatus || '').toLowerCase(); // pending, preparing, ready, served

    // Cancelled/Void
    if (s === 'void' || s === 'refunded' || s === 'cancelled' || s === 'rejected') {
        return { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50' };
    }

    // Finished/Delivered
    if (s === 'finished' || s === 'delivered' || s === 'completed') {
        return { label: 'Delivered', color: 'text-green-700', bg: 'bg-green-50' };
    }

    // Active States
    if (ks === 'ready' || s === 'out_for_delivery') {
        return { label: 'On the Way', color: 'text-purple-700', bg: 'bg-purple-50' };
    }

    if (ks === 'preparing' || s === 'confirmed') {
        return { label: 'Preparing', color: 'text-blue-700', bg: 'bg-blue-50' };
    }

    // Default Pending
    return { label: 'Waiting to Confirm', color: 'text-amber-700', bg: 'bg-amber-50' };
}
