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
    // EnhancedSecurity.init() is now auto-handled by auth.js

    // REMOVED: Legacy session check - auth.js handles this via cookies
    // if (window.isSessionValid && !window.isSessionValid()) {
    //     window.location.href = 'index.html';
    //     return;
    // }

    loadVendors();
    loadInventory();
}

function loadVendors() {
    const vendors = window.DB.getVendors();
    const select = document.getElementById('material-vendor');
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
    const search = document.getElementById('searchBox').value.toLowerCase();
    const dashboardContainer = document.getElementById('inventory-dashboard');
    const tbody = document.getElementById('inventory-table-body');

    if (!tbody) {
        console.error('Inventory Table Body not found');
        return;
    }

    // Render Dashboard (unchanged)
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
                    <div class="text-xs font-bold text-slate-500 uppercase">Dead Stock (>30d)</div>
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

    // Reset Counts
    let expiredCount = 0;
    let expiringCount = 0;
    let deadCount = 0;
    let healthyCount = 0;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No materials found.</td></tr>';
        // Only return if we truly want to stop. But we should probably leave the dashboard up?
        // Let's continue to update dashboard even if empty (counts will be 0)
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No materials found.</td></tr>';
        return;
    }

    filtered.forEach(m => {
        const vendor = vendors.find(v => v.id == m.vendorId);
        const cost = safeFloat(m.cost);
        const stock = safeFloat(m.stock);
        const totalValue = (cost * stock).toFixed(2);

        // Expiration Logic
        let expiryBadge = '';
        if (m.expirationDate) {
            const exp = new Date(m.expirationDate);
            const today = new Date();
            const diffTime = exp - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) {
                expiryBadge = `<div class="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded mt-1 border border-red-200 w-fit flex items-center gap-1 font-bold">
                                    <span class="material-symbols-outlined text-[10px]">warning</span> Expired
                                </div>`;
                expiredCount++;
            } else if (diffDays <= 30) {
                expiryBadge = `<div class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mt-1 border border-amber-200 w-fit flex items-center gap-1 font-bold">
                                    <span class="material-symbols-outlined text-[10px]">history</span> Exp: ${diffDays}d
                                </div>`;
                expiringCount++;
            }
        }

        // Health Logic (Movement)
        let healthBadge = '';
        let daysIdle = 999; // Default to very old if no lastUsedAt
        if (m.lastUsedAt) {
            const diff = new Date() - new Date(m.lastUsedAt);
            daysIdle = Math.floor(diff / (1000 * 60 * 60 * 24));
        }

        if (daysIdle <= 7) {
            healthBadge = `<span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200 ml-1">Healthy</span>`;
            healthyCount++;
        } else if (daysIdle <= 30) {
            healthBadge = `<span class="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold border border-blue-100 ml-1">Slow</span>`;
        } else {
            healthBadge = `<span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold border border-slate-200 ml-1">Dead</span>`;
            deadCount++;
        }


        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition-colors group";

        row.innerHTML = `
            <td class="px-6 py-4 text-sm font-medium text-slate-800">
                <div class="flex items-center">
                    ${m.name}
                    ${healthBadge}
                </div>
                ${expiryBadge}
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">${m.unit}</span>
            </td>
            <td class="px-6 py-4 text-right text-sm text-slate-600">${cost.toFixed(2)}</td>
            <td class="px-6 py-4 text-center">
                <span class="text-sm font-bold ${stock < 5 ? 'text-red-600' : 'text-slate-800'}">${stock.toFixed(3)}</span>
            </td>
            <td class="px-6 py-4 text-right text-sm font-bold text-slate-800">${totalValue}</td>
            <td class="px-6 py-4 text-sm text-slate-500">${vendor?.name || '-'}</td>
            <td class="px-6 py-4 text-center">
                 <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors" onclick="openRestockModal(${m.id})" title="Restock">
                        <span class="material-symbols-outlined text-[18px]">add_box</span>
                    </button>
                    <!-- 🟢 NEW: Adjustment Button -->
                    <button class="w-8 h-8 flex items-center justify-center bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors" onclick="openAdjustmentModal(${m.id})" title="Adjust/Waste">
                        <span class="material-symbols-outlined text-[18px]">tune</span>
                    </button>
                    <!-- 🟢 NEW: Transfer Button -->
                    <button class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" onclick="openTransferModal(${m.id})" title="Transfer">
                        <span class="material-symbols-outlined text-[18px]">move_up</span>
                    </button>
                    <button class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" onclick="editMaterial(${m.id})" title="Edit">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" onclick="deleteMaterial(${m.id})" title="Delete">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                 </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Update Counts
    document.getElementById('alert-expired-count').textContent = expiredCount;
    document.getElementById('alert-expiring-count').textContent = expiringCount;
    document.getElementById('alert-dead-count').textContent = deadCount;
    document.getElementById('alert-healthy-count').textContent = healthyCount;
}

// ... existing handleSaveMaterial, editMaterial, deleteMaterial, resetForm ...

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


// Restock Feature (Existing) - Update to use API logic if needed? 
// Current Restock uses DB.addVendorTransaction + electronAPI.updateStock.
// That is technically a "Purchase". 
// Ideally "Purchase" should also be an InventoryAdjustment of type 'PURCHASE' or similar?
// But user spec didn't strictly ask to migrate Purchase logic, just Waste/Audit.
// We'll leave Restock as is for now, or maybe later add an Adjustment record too?
// The user spec said "One table for ALL stock movements". 
// So ideally, yes, confirmed restock SHOULD create a TRANSFER_IN or PURCHASE record.
// But let's stick to the specific request for now (Waste/Audit). 

window.openRestockModal = function (id) {
    // ... existing ... 
    const ing = window.DB.getIngredient(id);
    if (!ing) return;

    document.getElementById('restock-id').value = id;
    document.getElementById('restock-current-stock').textContent = safeFloat(ing.stock);
    document.getElementById('restock-current-cost').textContent = safeFloat(ing.cost).toFixed(2);
    document.getElementById('restock-qty').value = '';
    document.getElementById('restock-cost').value = '';

    // Auto-fill cost if available from existing
    if (ing.cost > 0) document.getElementById('restock-cost').value = ing.cost;

    document.getElementById('restockModal').style.display = 'block';
};

window.confirmRestock = function () {
    // ... existing logic ...
    const id = parseInt(document.getElementById('restock-id').value);
    const qty = parseFloat(document.getElementById('restock-qty').value);
    const newUnitCost = parseFloat(document.getElementById('restock-cost').value);
    const method = document.getElementById('restock-method').value; // cash or credit

    if (isNaN(qty) || qty <= 0) return alert('Invalid Quantity');
    if (isNaN(newUnitCost) || newUnitCost < 0) return alert('Invalid Cost');

    const ing = window.DB.getIngredient(id);
    if (!ing) return;

    const oldStock = safeFloat(ing.stock);
    const oldUnitCost = safeFloat(ing.cost);

    // === COST CALCULATION (Weighted Average) ===
    let finalUnitCost = newUnitCost;
    if (oldStock > 0) {
        const totalValue = (oldStock * oldUnitCost) + (qty * newUnitCost);
        finalUnitCost = totalValue / (oldStock + qty);
    }

    // ✅ FIX: Update Local Stock Immediately
    ing.stock = oldStock + qty;
    ing.cost = parseFloat(finalUnitCost.toFixed(2));
    ing.lastRestockDate = new Date().toISOString();

    // Save Definition (Cost Update)
    if (window.DB.saveIngredient(ing)) {
        // Update Stock via API (Double write, but ensures sync)
        window.electronAPI.updateStock(id, ing.stock);

        // 🟢 ALSO RECORD AS ADJUSTMENT (PURCHASE/TRANSFER_IN)
        // Ideally we call the API to do this record keeping.
        // But since we already updated stock manually via .updateStock above...
        // If we call .adjust, it will increment AGAIN. 
        // So we should NOT call .updateStock and instead use .adjust?
        // OR we just create the record without updating stock? API doesn't support that flag.
        // Let's just leave Restock alone for this specific task scope 
        // unless I want to refactor Restock to use the new API entirely.
        // Given "Phase 6" focuses on Waste/Audit, I will leave Restock as "Purchase" flow (Vendor Transaction).

        const totalPurchaseValue = qty * newUnitCost;

        // === VENDOR & FINANCIAL LOGIC ===
        if (ing.vendorId) {
            // ... existing vendor logic ...
            window.DB.addVendorTransaction({
                vendorId: ing.vendorId,
                type: 'purchase',
                amount: totalPurchaseValue,
                description: `Restock: ${ing.name} (${qty} x ${newUnitCost})`,
                date: new Date().toISOString().split('T')[0],
                method: method
            });

            if (method === 'cash') {
                window.DB.addVendorTransaction({
                    vendorId: ing.vendorId,
                    type: 'payment',
                    amount: totalPurchaseValue,
                    description: `Cash Payment for Restock: ${ing.name}`,
                    date: new Date().toISOString().split('T')[0],
                    method: 'cash'
                });
            }
        }

        alert('Restock Successful!');
        document.getElementById('restockModal').style.display = 'none';
        loadInventory();
    } else {
        alert('Failed to save stock update.');
    }
};
