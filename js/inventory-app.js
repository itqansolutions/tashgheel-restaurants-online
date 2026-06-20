/**
 * Inventory Management (Raw Materials)
 */
window.currentPage = 'inventory';

document.addEventListener("DOMContentLoaded", () => {
    // Attach listeners immediately
    const form = document.getElementById('inventory-form');
    if (form) form.addEventListener('submit', handleSaveMaterial);

    const search = document.getElementById('searchBox');
    if (search) search.addEventListener('input', loadInventory);

    // Initialize Data safely
    if (window.SystemReady) {
        initApp();
    } else {
        window.addEventListener('SystemDataReady', () => {
            console.log('🚀 System Data Ready - Initializing Inventory');
            initApp();
        });
        // Failsafe: Try anyway after 2 seconds if event missed
        setTimeout(() => {
            if (!document.getElementById('inventory-table-body').innerHTML.trim()) initApp();
        }, 2000);
    }
});

async function initApp() {
    await loadBranches();
    await loadVendors();
    loadInventory();
}

// === BRANCH MANAGEMENT ===
let allBranches = [];

async function loadBranches() {
    try {
        if (window.apiFetch) {
            const branches = await window.apiFetch('/branches');
            allBranches = Array.isArray(branches) ? branches : [];
        }
    } catch (e) {
        console.warn('Could not load branches:', e);
        allBranches = [];
    }

    // Populate branch filter
    const branchFilter = document.getElementById('branchFilter');
    if (!branchFilter) return;

    const activeBranchId = localStorage.getItem('activeBranchId') || '';
    branchFilter.innerHTML = '<option value="">All Branches</option>';
    allBranches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name + (b.code ? ` (${b.code})` : '');
        if (b.id === activeBranchId) opt.selected = true;
        branchFilter.appendChild(opt);
    });

    // If no branch selected and activeBranchId exists, default to it
    if (activeBranchId && branchFilter.value !== activeBranchId) {
        // activeBranchId not in list (different tenant) - leave as 'All'
    }
}

function onBranchFilterChange() {
    loadInventory();
}

function getActiveBranchId() {
    const filter = document.getElementById('branchFilter');
    if (filter && filter.value) return filter.value;
    return localStorage.getItem('activeBranchId') || null;
}

async function loadVendors() {
    let vendors = [];

    // In web mode, vendors live in the Vendor DB table (via /parties/vendors REST API),
    // NOT in the generic data KV store that window.DB.getVendors() reads from.
    if (window.electronAPI && window.electronAPI.isWebAdapter && window.apiFetch) {
        try {
            const result = await window.apiFetch('/parties/vendors');
            if (Array.isArray(result)) {
                vendors = result;
                // Update the DataCache so other parts of the app can find them
                if (window.DataCache) window.DataCache['vendors'] = vendors;
            }
        } catch (e) {
            console.warn('Failed to fetch vendors from API, falling back to cache:', e);
            vendors = window.DB.getVendors();
        }
    } else {
        vendors = window.DB.getVendors();
    }

    const select = document.getElementById('material-vendor');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select Vendor --</option>';
    vendors.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        select.appendChild(opt);
    });
}

// Safe Float Parsing Helper
function safeFloat(val) {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
}

function loadInventory() {
    const materials = window.DB.getIngredients();
    const vendors = window.DB.getVendors();
    const search = document.getElementById('searchBox')?.value.toLowerCase() || '';
    const activeBranchId = getActiveBranchId();
    const dashboardContainer = document.getElementById('inventory-dashboard');
    const tbody = document.getElementById('inventory-table-body');

    if (!tbody) { console.error('Inventory Table Body not found'); return; }

    const shopSettings = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const deadStockDays = parseInt(shopSettings.deadStockDays) || 30;
    const lang = localStorage.getItem('pos_language') || 'en';
    const deadStockLabel = lang === 'ar' ? `مخزون راكد (>${deadStockDays} يوم)` : `Dead Stock (>${deadStockDays}d)`;

    // Render Dashboard
    if (dashboardContainer) {
        dashboardContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-red-50 p-4 rounded-xl border border-red-100 flex items-center justify-between">
                <div>
                    <div class="text-xs font-bold text-red-500 uppercase">Expired</div>
                    <div class="text-xl font-bold text-red-700" id="alert-expired-count">0</div>
                </div>
                <span class="material-symbols-outlined text-red-400 text-3xl">event_busy</span>
            </div>
            <div class="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-center justify-between">
                <div>
                    <div class="text-xs font-bold text-amber-500 uppercase">Expiring Soon</div>
                    <div class="text-xl font-bold text-amber-700" id="alert-expiring-count">0</div>
                </div>
                <span class="material-symbols-outlined text-amber-400 text-3xl">history</span>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                    <div class="text-xs font-bold text-slate-500 uppercase">${deadStockLabel}</div>
                    <div class="text-xl font-bold text-slate-700" id="alert-dead-count">0</div>
                </div>
                <span class="material-symbols-outlined text-slate-400 text-3xl">inventory_2</span>
            </div>
            <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center justify-between">
                <div>
                    <div class="text-xs font-bold text-emerald-500 uppercase">Healthy Stock</div>
                    <div class="text-xl font-bold text-emerald-700" id="alert-healthy-count">0</div>
                </div>
                <span class="material-symbols-outlined text-emerald-400 text-3xl">check_circle</span>
            </div>
        </div>`;
    }

    const filtered = materials.filter(m => m.name.toLowerCase().includes(search));
    tbody.innerHTML = '';

    let expiredCount = 0, expiringCount = 0, deadCount = 0, healthyCount = 0;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">No materials found.</td></tr>';
        return;
    }

    filtered.forEach(m => {
        const vendor = vendors.find(v => v.id == m.vendorId);
        const cost = safeFloat(m.cost);

        // 🌿 Branch-aware stock display
        let stock;
        if (activeBranchId && m.stockByBranch && m.stockByBranch[activeBranchId] !== undefined) {
            stock = safeFloat(m.stockByBranch[activeBranchId]);
        } else if (!activeBranchId && m.stock !== undefined) {
            stock = safeFloat(m.stock); // All branches: show total
        } else {
            stock = safeFloat(m.stock || 0); // Fallback
        }

        const totalValue = (cost * stock).toFixed(2);
        const minStock = safeFloat(m.minStock || 0);
        const isLow = stock <= minStock && minStock > 0;

        // Expiration Logic
        let expiryBadge = '';
        if (m.expirationDate) {
            const exp = new Date(m.expirationDate);
            const today = new Date();
            const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
            if (diffDays <= 0) {
                expiryBadge = `<div class="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded mt-1 border border-red-200 w-fit flex items-center gap-1 font-bold"><span class="material-symbols-outlined text-[10px]">warning</span> Expired</div>`;
                expiredCount++;
            } else if (diffDays <= 30) {
                expiryBadge = `<div class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mt-1 border border-amber-200 w-fit flex items-center gap-1 font-bold"><span class="material-symbols-outlined text-[10px]">history</span> Exp: ${diffDays}d</div>`;
                expiringCount++;
            }
        }

        // Health Logic
        let healthBadge = '';
        let daysIdle = 999;
        if (m.lastUsedAt) daysIdle = Math.floor((new Date() - new Date(m.lastUsedAt)) / (1000 * 60 * 60 * 24));
        if (daysIdle <= 7) { healthBadge = `<span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200 ml-1">Healthy</span>`; healthyCount++; }
        else if (daysIdle <= deadStockDays) { healthBadge = `<span class="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold border border-blue-100 ml-1">Slow</span>`; }
        else { healthBadge = `<span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold border border-slate-200 ml-1">Dead</span>`; deadCount++; }

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors group';
        row.innerHTML = `
            <td class="px-6 py-4 text-sm font-medium text-slate-800">
                <div class="flex items-center">${m.name}${healthBadge}</div>
                ${expiryBadge}
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">${m.unit}</span>
            </td>
            <td class="px-6 py-4 text-right text-sm text-slate-600">${cost.toFixed(2)}</td>
            <td class="px-6 py-4 text-center">
                <span class="text-sm font-bold ${isLow ? 'text-red-600' : 'text-slate-800'}">${stock.toFixed(3)}</span>
                ${isLow ? '<span class="block text-[10px] text-red-500">Low Stock</span>' : ''}
            </td>
            <td class="px-6 py-4 text-right text-sm font-bold text-slate-800">${totalValue}</td>
            <td class="px-6 py-4 text-sm text-slate-500">${vendor?.name || '-'}</td>
            <td class="px-6 py-4 text-center">
                <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors" onclick="openRestockModal(${m.id})" title="Restock">
                        <span class="material-symbols-outlined text-[18px]">add_box</span>
                    </button>
                    <button class="w-8 h-8 flex items-center justify-center bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors" onclick="openAdjustmentModal(${m.id})" title="Adjust/Waste">
                        <span class="material-symbols-outlined text-[18px]">tune</span>
                    </button>
                    <button class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" onclick="openTransferModal(${m.id})" title="Transfer">
                        <span class="material-symbols-outlined text-[18px]">move_up</span>
                    </button>
                    <button class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" onclick="editMaterial(${m.id})" title="Edit">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" onclick="deleteMaterial(${m.id})" title="Delete">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('alert-expired-count').textContent = expiredCount;
    document.getElementById('alert-expiring-count').textContent = expiringCount;
    document.getElementById('alert-dead-count').textContent = deadCount;
    document.getElementById('alert-healthy-count').textContent = healthyCount;
}

// === FORM HANDLING ===
function handleSaveMaterial(e) {
    e.preventDefault();

    const id = document.getElementById('material-id').value;
    const name = document.getElementById('material-name').value.trim();
    const unit = document.getElementById('material-unit').value.trim();
    const cost = parseFloat(document.getElementById('material-cost').value);
    const stock = parseFloat(document.getElementById('material-stock').value || 0);
    const vendorId = document.getElementById('material-vendor').value;
    const minStock = parseFloat(document.getElementById('material-min').value);
    const expDate = document.getElementById('material-exp').value;

    if (!name || isNaN(cost)) {
        alert('Please fill required fields (Name, Cost)');
        return;
    }

    const activeBranchId = getActiveBranchId();
    const existingIngredient = id ? window.DB.getIngredient(id) : null;

    // Merge stockByBranch: keep existing branch stocks, set current branch stock for new items
    let stockByBranch = existingIngredient?.stockByBranch || {};
    if (!id && activeBranchId) {
        // New material: initialise stock for the current branch
        stockByBranch[activeBranchId] = isNaN(stock) ? 0 : stock;
    }

    const material = {
        id: id ? parseInt(id) : Date.now(),
        name,
        unit,
        cost,
        stock: id ? (existingIngredient?.stock || 0) : (isNaN(stock) ? 0 : stock),
        stockByBranch,
        vendorId,
        minStock: isNaN(minStock) ? 5 : minStock,
        expirationDate: expDate || null
    };

    window.DB.saveIngredient(material);
    resetForm();
    loadInventory();
    alert(id ? 'Material Updated' : 'Material Added');
}

async function editMaterial(id) {
    const mat = window.DB.getIngredient(id);
    if (!mat) return;

    // Ensure vendor dropdown is populated before setting value
    await loadVendors();

    document.getElementById('material-id').value = mat.id;
    document.getElementById('material-name').value = mat.name;
    document.getElementById('material-unit').value = mat.unit;
    document.getElementById('material-cost').value = mat.cost;
    document.getElementById('material-vendor').value = mat.vendorId || "";
    document.getElementById('material-min').value = mat.minStock || 5;
    document.getElementById('material-exp').value = mat.expirationDate ? mat.expirationDate.split('T')[0] : "";

    document.getElementById('form-title').textContent = "Edit Raw Material";
    document.getElementById('btn-cancel').classList.remove('hidden');

    // Scroll to form
    document.getElementById('inventory-form').scrollIntoView({ behavior: 'smooth' });
}

function deleteMaterial(id) {
    if (confirm('Delete this material? Stock history will remain but definition will be removed.')) {
        window.DB.deleteIngredient(id);
        loadInventory();
    }
}

function resetForm() {
    document.getElementById('inventory-form').reset();
    document.getElementById('material-id').value = "";
    document.getElementById('form-title').textContent = "Add New Raw Material";
    document.getElementById('btn-cancel').classList.add('hidden');
}

// Expose globally
window.editMaterial = editMaterial;
window.deleteMaterial = deleteMaterial;
window.resetForm = resetForm;

// Stock Audit Logic
function openStockAudit() {
    const ingredients = window.DB.getIngredients();
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    ingredients.forEach(ing => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ing.name}</td>
            <td>${ing.unit}</td>
            <td id="rec-stock-${ing.id}">${safeFloat(ing.stock).toFixed(3)}</td>
            <td>
                <input type="number" step="0.001" 
                       id="act-stock-${ing.id}" 
                       value="${safeFloat(ing.stock)}" 
                       oninput="calculateAuditDifference(${ing.id})"
                       style="width: 100px;">
            </td>
            <td id="diff-${ing.id}">0.000</td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('auditModal').style.display = 'block';
}

function calculateAuditDifference(id) {
    const recordedEl = document.getElementById(`rec-stock-${id}`);
    const actualInput = document.getElementById(`act-stock-${id}`);
    const diffEl = document.getElementById(`diff-${id}`);

    if (!recordedEl || !actualInput || !diffEl) return;

    const recorded = parseFloat(recordedEl.textContent) || 0;
    const actual = parseFloat(actualInput.value) || 0;
    const diff = actual - recorded;

    diffEl.textContent = diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);
    diffEl.style.color = diff < 0 ? 'red' : (diff > 0 ? 'green' : 'black');
}

async function saveStockAudit() {
    if (!confirm('Are you sure you want to update inventory stock levels? This will be logged as an Audit.')) return;

    const ingredients = window.DB.getIngredients();
    let updatedCount = 0;

    // We process sequentially to ensure order
    for (const ing of ingredients) {
        const actualInput = document.getElementById(`act-stock-${ing.id}`);
        if (actualInput) {
            const newStock = parseFloat(actualInput.value);
            // Update if valid diff exists
            const diff = newStock - (ing.stock || 0);

            if (!isNaN(newStock) && Math.abs(diff) > 0.0001) {
                try {
                    // 🟢 USE NEW API
                    await window.apiFetch('/inventory/adjust', {
                        method: 'POST',
                        body: JSON.stringify({
                            itemId: ing.id,
                            type: 'AUDIT',
                            qty: diff, // API adds this to current stock. Wait. 
                            // API implementation: $inc: { qty: adjustmentQty }.
                            // So if I send +5, stock becomes old+5. 
                            // Here diff is (Available - Recorded). 
                            // Example: Rec=10, Act=12. Diff = +2. New = 10+2=12. Correct.
                            // Example: Rec=10, Act=8. Diff = -2. New = 10-2=8. Correct.
                            unitCost: safeFloat(ing.cost),
                            reason: 'Bulk Stock Audit'
                        })
                    });

                    // Update Local
                    ing.stock = newStock;
                    window.DB.saveIngredient(ing);
                    updatedCount++;

                } catch (e) {
                    console.error(`Failed to audit item ${ing.name}`, e);
                }
            }
        }
    }

    alert(`Audit Complete. Updated ${updatedCount} items.`);
    closeStockAudit();
    loadInventory(); // Refresh main table
}

function closeStockAudit() {
    document.getElementById('auditModal').style.display = 'none';
}

window.openStockAudit = openStockAudit;
window.saveStockAudit = saveStockAudit;
window.closeStockAudit = closeStockAudit;
window.calculateAuditDifference = calculateAuditDifference;
window.onBranchFilterChange = onBranchFilterChange;
window.getActiveBranchId = getActiveBranchId;


// 🟢 NEW: Adjustment Logic
window.openAdjustmentModal = function (id) {
    const ing = window.DB.getIngredient(id);
    if (!ing) return;

    document.getElementById('adj-id').value = id;
    document.getElementById('adj-current-stock').textContent = safeFloat(ing.stock).toFixed(3);
    document.getElementById('adj-current-cost').textContent = safeFloat(ing.cost).toFixed(2);

    document.getElementById('adj-type').value = 'WASTE'; // Default
    document.getElementById('adj-qty').value = '';
    document.getElementById('adj-reason').value = '';

    document.getElementById('adjustmentModal').style.display = 'block';
};

window.confirmAdjustment = async function () {
    const id = parseInt(document.getElementById('adj-id').value);
    const type = document.getElementById('adj-type').value;
    let qty = parseFloat(document.getElementById('adj-qty').value);
    const reason = document.getElementById('adj-reason').value.trim();

    if (!id) return;
    if (isNaN(qty) || qty <= 0) return alert('Please enter a valid positive quantity.');

    // Validation for Reason
    if (['WASTE', 'DAMAGE', 'EXPIRED'].includes(type) && !reason) {
        return alert('Reason is required for Waste/Damage/Expired adjustments.');
    }

    const ing = window.DB.getIngredient(id);
    if (!ing) return;

    // Logic: 
    // WASTE, DAMAGE, EXPIRED, TRANSFER_OUT -> Negative
    // TRANSFER_IN -> Positive
    // AUDIT -> (Handled separately generally, but if used here, user enters DIFF? 
    // The Modal title says "Adjust", usually implies "Add/Remove". 
    // Let's assume input is Magnitude, and Type determines sign.

    let finalQty = qty;
    if (['WASTE', 'DAMAGE', 'EXPIRED', 'TRANSFER_OUT'].includes(type)) {
        finalQty = -qty;
    }
    // TRANSFER_IN is +qty.
    // AUDIT here... tricky. Usually audit is "Set to X". 
    // But if they key "Audit Correction" and "+5", it means we found 5 more. 
    // If they key "Audit Correction" and logic says "Subtract", then we need "Negative" check?
    // User instruction says "enter positive number". 
    // For AUDIT in this modal, let's assume it's an additive correction.
    // If they want to reduce via audit here, they might face issue if we force abs(qty).
    // Let's rely on type. If AUDIT, we trust the sign? 
    // But input type="number" with placeholder "0.000" implies positive magnitude.
    // Let's keep it simple: WASTE/DAMAGE/EXP/OUT = Subtract. IN = Add. 
    // AUDIT... let's treat as Add? Or maybe allow negative input?
    // "For Waste/Damage, enter positive number (system will subtract)."
    // Let's stick to that rule. 
    // If they want to do proper Audit, they should use Stock Audit (Bulk). 
    // This modal is mostly for "I dropped a tomato".

    try {
        const response = await window.apiFetch('/inventory/adjust', {
            method: 'POST',
            body: JSON.stringify({
                itemId: id,
                type,
                qty: finalQty,
                unitCost: safeFloat(ing.cost),
                reason: reason || 'Manual Adjustment'
            })
        });

        if (response.success) {
            // Update Local
            ing.stock = (safeFloat(ing.stock) + finalQty);
            window.DB.saveIngredient(ing);

            alert('Adjustment Saved!');
            document.getElementById('adjustmentModal').style.display = 'none';
            loadInventory();
        } else {
            alert('Error: ' + (response.error || 'Unknown'));
        }
    } catch (e) {
        console.error('Adj Error:', e);
        alert('Failed to save adjustment.');
    }
};

// 🟢 NEW: Transfer Logic
window.openTransferModal = async function (id) {
    const ing = window.DB.getIngredient(id);
    if (!ing) return;

    document.getElementById('trf-id').value = id;
    document.getElementById('trf-current-stock').textContent = safeFloat(ing.stock).toFixed(3);
    document.getElementById('trf-qty').value = '';

    // Load Branches (Filtering out current branch handles in backend, but good to filter in UI too if we knew current branchId)
    // We rely on API list.
    const select = document.getElementById('trf-target-branch');
    select.innerHTML = '<option value="">Loading...</option>';

    try {
        let branches = [];
        if (window.apiFetch) {
            branches = await window.apiFetch('/branches');
        } else {
            branches = JSON.parse(localStorage.getItem('branches') || '[]');
        }

        select.innerHTML = '<option value="">-- Select Target Branch --</option>';

        // Filter out current branch if possible? 
        // We don't have currentBranchId easily accessible unless we parse token or check localStorage 'currentBranch'.
        // Let's assume user knows not to pick same name, or backend rejects it.
        const currentBranch = localStorage.getItem('currentBranch') ? JSON.parse(localStorage.getItem('currentBranch')) : null;

        branches.forEach(b => {
            const bId = b._id || b.id;
            if (currentBranch && (bId === currentBranch.id || bId === currentBranch._id)) return; // Skip current

            const opt = document.createElement('option');
            opt.value = bId;
            opt.textContent = b.name + (b.code ? ` (${b.code})` : '');
            select.appendChild(opt);
        });

    } catch (e) {
        console.error('Error loading branches', e);
        select.innerHTML = '<option value="">Error loading branches</option>';
    }

    document.getElementById('transferModal').style.display = 'block';
};

window.confirmTransfer = async function () {
    const id = parseInt(document.getElementById('trf-id').value);
    const targetBranchId = document.getElementById('trf-target-branch').value;
    const qty = parseFloat(document.getElementById('trf-qty').value);

    if (!id) return;
    if (!targetBranchId) return alert('Please select a target branch.');
    if (isNaN(qty) || qty <= 0) return alert('Please enter a valid positive quantity.');

    const ing = window.DB.getIngredient(id);
    if (!ing) return; // Should not happen

    if (qty > safeFloat(ing.stock)) {
        return alert('Insufficient stock for transfer.');
    }

    try {
        const response = await window.apiFetch('/inventory/transfer', {
            method: 'POST',
            body: JSON.stringify({
                itemId: id,
                targetBranchId,
                qty,
                unitCost: safeFloat(ing.cost)
            })
        });

        if (response.success) {
            // Update Local Stock (Decrement)
            ing.stock = safeFloat(ing.stock) - qty;
            window.DB.saveIngredient(ing);

            alert('Transfer Successful! Ref ID: ' + response.referenceId);
            document.getElementById('transferModal').style.display = 'none';
            loadInventory();
        } else {
            alert('Transfer Failed: ' + (response.error || 'Unknown Error'));
        }

    } catch (e) {
        console.error('Transfer Error:', e);
        alert('Failed to process transfer.');
    }
};


// === RESTOCK (New Financial Flow) ===

let _restockPurchaseType = 'credit';  // 'credit' | 'paid_now'
let _restockPaymentMethod = 'cash';   // 'cash' | 'card' | 'mobile'

window.openRestockModal = function (id) {
    const ing = window.DB.getIngredient(id);
    if (!ing) return;

    // Populate hidden fields
    document.getElementById('restock-id').value = id;
    document.getElementById('restock-vendor-id').value = ing.vendorId || '';
    document.getElementById('restock-ingredient-name').value = ing.name || '';
    document.getElementById('restock-ingredient-unit').value = ing.unit || '';

    // Current stock for active branch
    const activeBranchId = getActiveBranchId();
    const branchStock = activeBranchId && ing.stockByBranch
        ? safeFloat(ing.stockByBranch[activeBranchId] ?? ing.stock ?? 0)
        : safeFloat(ing.stock || 0);

    document.getElementById('restock-material-subtitle').textContent = ing.name + (ing.unit ? ` (${ing.unit})` : '');
    document.getElementById('restock-current-stock').textContent = branchStock.toFixed(3) + (ing.unit ? ' ' + ing.unit : '');
    document.getElementById('restock-current-cost').textContent = safeFloat(ing.cost).toFixed(2);

    // Clear inputs
    document.getElementById('restock-qty').value = '';
    document.getElementById('restock-cost').value = ing.cost > 0 ? ing.cost : '';
    document.getElementById('restock-notes').value = '';
    document.getElementById('restock-total-preview').textContent = '0.00';

    // Reset purchase type to credit
    _restockPurchaseType = 'credit';
    _restockPaymentMethod = 'cash';
    setPurchaseType('credit');

    document.getElementById('restockModal').style.display = 'block';
};

window.updateRestockTotal = function () {
    const qty = parseFloat(document.getElementById('restock-qty').value || 0);
    const cost = parseFloat(document.getElementById('restock-cost').value || 0);
    const total = (qty * cost).toFixed(2);
    document.getElementById('restock-total-preview').textContent = total;

    // Update summary badge
    const badge = document.getElementById('restock-summary-badge');
    const summaryText = document.getElementById('restock-summary-text');
    if (qty > 0 && cost >= 0) {
        const type = _restockPurchaseType;
        const pm = _restockPaymentMethod;
        if (type === 'credit') {
            summaryText.textContent = ` Vendor debt will increase by ${total}. Appears in Expenses as 'Raw Materials'.`;
        } else {
            summaryText.textContent = ` Paid ${total} via ${pm}. 2 ledger rows created (purchase + payment). Appears in Expenses.`;
        }
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
};

window.setPurchaseType = function (type) {
    _restockPurchaseType = type;
    const btnCredit = document.getElementById('btn-credit');
    const btnPaid   = document.getElementById('btn-paid');
    const pmRow     = document.getElementById('payment-method-row');

    if (type === 'credit') {
        btnCredit.className = 'flex flex-col items-center gap-1.5 py-3 px-4 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-700 font-bold text-sm transition-all';
        btnPaid.className   = 'flex flex-col items-center gap-1.5 py-3 px-4 rounded-xl border-2 border-slate-200 bg-white text-slate-500 font-bold text-sm transition-all hover:border-green-400';
        pmRow.style.display = 'none';
    } else {
        btnCredit.className = 'flex flex-col items-center gap-1.5 py-3 px-4 rounded-xl border-2 border-slate-200 bg-white text-slate-500 font-bold text-sm transition-all hover:border-amber-400';
        btnPaid.className   = 'flex flex-col items-center gap-1.5 py-3 px-4 rounded-xl border-2 border-green-500 bg-green-50 text-green-700 font-bold text-sm transition-all';
        pmRow.style.display = 'block';
    }
    window.updateRestockTotal();
};

window.setPaymentMethod = function (method) {
    _restockPaymentMethod = method;
    document.getElementById('restock-payment-method').value = method;

    const colors = { cash: 'emerald', card: 'blue', mobile: 'purple' };
    ['cash', 'card', 'mobile'].forEach(m => {
        const btn = document.getElementById(`pmBtn-${m}`);
        if (!btn) return;
        if (m === method) {
            btn.className = `py-2 rounded-lg border-2 border-${colors[m]}-400 bg-${colors[m]}-50 text-${colors[m]}-700 font-bold text-xs transition-all`;
        } else {
            btn.className = `py-2 rounded-lg border-2 border-slate-200 bg-white text-slate-500 font-bold text-xs transition-all hover:border-${colors[m]}-400`;
        }
    });
    window.updateRestockTotal();
};

window.confirmRestock = async function () {
    const id = parseInt(document.getElementById('restock-id').value);
    const qty = parseFloat(document.getElementById('restock-qty').value);
    const newUnitCost = parseFloat(document.getElementById('restock-cost').value);
    const notes = document.getElementById('restock-notes').value.trim();

    if (isNaN(qty) || qty <= 0) return alert('Please enter a valid quantity.');
    if (isNaN(newUnitCost) || newUnitCost < 0) return alert('Please enter a valid unit cost.');

    const ing = window.DB.getIngredient(id);
    if (!ing) return alert('Ingredient not found.');

    const vendorId = document.getElementById('restock-vendor-id').value || ing.vendorId || null;

    try {
        const response = await window.apiFetch('/inventory/restock', {
            method: 'POST',
            body: JSON.stringify({
                ingredientId: id,
                ingredientName: ing.name,
                ingredientUnit: ing.unit,
                vendorId: vendorId || null,
                qty,
                unitCost: newUnitCost,
                purchaseType: _restockPurchaseType,
                paymentMethod: _restockPurchaseType === 'paid_now' ? _restockPaymentMethod : null,
                notes: notes || null
            })
        });

        if (!response.success) throw new Error(response.error || 'Server error');

        // Update local cache so inventory list reflects immediately
        const activeBranchId = getActiveBranchId();
        const oldTotalStock = safeFloat(ing.stock || 0);
        const oldCost = safeFloat(ing.cost || 0);

        if (!ing.stockByBranch) ing.stockByBranch = {};
        const branchKey = activeBranchId || 'default';
        const branchStock = safeFloat(ing.stockByBranch[branchKey] ?? ing.stock ?? 0);
        ing.stockByBranch[branchKey] = branchStock + qty;
        ing.stock = Object.values(ing.stockByBranch).reduce((sum, v) => sum + safeFloat(v), 0);

        // Weighted average cost
        if (oldTotalStock > 0) {
            ing.cost = parseFloat(((oldTotalStock * oldCost + qty * newUnitCost) / (oldTotalStock + qty)).toFixed(4));
        } else {
            ing.cost = newUnitCost;
        }
        ing.lastRestockDate = new Date().toISOString();
        window.DB.saveIngredient(ing);

        const totalCost = (qty * newUnitCost).toFixed(2);
        const typeLabel = _restockPurchaseType === 'credit' ? 'Credit' : `Paid (${_restockPaymentMethod})`;
        window.showToast
            ? window.showToast(`✅ Restocked! ${qty} ${ing.unit} added. Total: ${totalCost} [${typeLabel}]`, 'success')
            : alert(`Restock Successful! ${qty} ${ing.unit} added. Total: ${totalCost} [${typeLabel}]`);

        document.getElementById('restockModal').style.display = 'none';
        loadInventory();

    } catch (err) {
        console.error('Restock Error:', err);
        alert('Restock failed: ' + (err.message || 'Unknown error'));
    }
};

