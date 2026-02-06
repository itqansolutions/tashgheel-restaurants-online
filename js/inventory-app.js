/**
 * Inventory Management (Raw Materials)
 */
window.currentPage = 'inventory';

document.addEventListener("DOMContentLoaded", () => {
    // Attach listeners immediately to prevent native form submission
    const form = document.getElementById('inventory-form');
    if (form) form.addEventListener('submit', handleSaveMaterial);

    const search = document.getElementById('searchBox');
    if (search) search.addEventListener('input', loadInventory);

    // Initialize Data
    initApp();
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

function loadInventory() {
    const materials = window.DB.getIngredients();
    const vendors = window.DB.getVendors();
    const search = document.getElementById('searchBox').value.toLowerCase();
    const container = document.getElementById('inventory-table-container'); // Assuming this is the container for the entire inventory display

    const filtered = materials.filter(m => m.name.toLowerCase().includes(search));

    container.innerHTML = `
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
                    <div class="text-xs font-bold text-emerald-500 uppercase">Healty Stock</div>
                    <div class="text-xl font-bold text-emerald-700" id="alert-healthy-count">0</div>
                </div>
                <span class="material-symbols-outlined text-emerald-400 text-3xl">check_circle</span>
            </div>
        </div>

        <table class="w-full text-left border-collapse">
            <thead class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 sticky top-0">
                <tr>
                    <th class="px-6 py-3">Material Name</th>
                    <th class="px-6 py-3">Unit</th>
                    <th class="px-6 py-3 text-right">Cost</th>
                    <th class="px-6 py-3 text-center">Stock</th>
                    <th class="px-6 py-3 text-right">Value</th>
                    <th class="px-6 py-3">Vendor</th>
                    <th class="px-6 py-3 text-center">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white" id="inventory-table-body">
                <!-- Rows -->
            </tbody>
        </table>
    `;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No materials found.</td></tr>';
        return;
    }

    filtered.forEach(m => {
        const vendor = vendors.find(v => v.id == m.vendorId);
        const totalValue = (parseFloat(m.cost) * parseFloat(m.stock)).toFixed(2);

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
            <td class="px-6 py-4 text-right text-sm text-slate-600">${parseFloat(m.cost).toFixed(2)}</td>
            <td class="px-6 py-4 text-center">
                <span class="text-sm font-bold ${m.stock < 5 ? 'text-red-600' : 'text-slate-800'}">${parseFloat(m.stock).toFixed(3)}</span>
            </td>
            <td class="px-6 py-4 text-right text-sm font-bold text-slate-800">${totalValue}</td>
            <td class="px-6 py-4 text-sm text-slate-500">${vendor?.name || '-'}</td>
            <td class="px-6 py-4 text-center">
                 <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors" onclick="openRestockModal(${m.id})" title="Restock">
                        <span class="material-symbols-outlined text-[18px]">add_box</span>
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

    // Update Counts
    document.getElementById('alert-expired-count').textContent = expiredCount;
    document.getElementById('alert-expiring-count').textContent = expiringCount;
    document.getElementById('alert-dead-count').textContent = deadCount;
    document.getElementById('alert-healthy-count').textContent = healthyCount;
}

function handleSaveMaterial(e) {
    e.preventDefault();

    try {
        const id = document.getElementById('material-id').value;
        const name = document.getElementById('material-name').value.trim();
        const unit = document.getElementById('material-unit').value;
        const costInput = document.getElementById('material-cost').value;
        const stockInput = document.getElementById('material-stock').value;
        const vendorId = document.getElementById('material-vendor').value;

        if (!name) return alert('Error: Material Name is required.');
        if (costInput === '' || isNaN(parseFloat(costInput))) return alert('Error: Valid Cost is required.');
        if (stockInput === '' || isNaN(parseFloat(stockInput))) return alert('Error: Valid Stock is required.');

        const cost = parseFloat(costInput);
        const stock = parseFloat(stockInput);

        const material = {
            id: id ? parseInt(id) : Date.now(),
            name,
            unit,
            cost,
            expirationDate: document.getElementById('material-expiration').value || null,
            vendorId: vendorId || null
            // Stock is handled separately for SaaS
        };

        // 1. Save Definition (Global)
        // We do NOT save stock in the definition file to prevent overwrites
        const result = window.DB.saveIngredient(material);

        if (!result) {
            alert('Error: Database failed to save the material. Storage might be full.');
            return;
        }

        // 2. Save Stock (Branch Scoped)
        if (stock > 0) {
            // We await this to ensure it persists check
            // Note: initApp doesn't await listener, so we use promise syntax or assumes fast enough
            // Better to make handleSaveMaterial async if possible, but event handler...
            // We can just fire and forget or use .then
            window.electronAPI.updateStock(material.id, stock);
        }

        // === VENDOR LOGIC (For New Materials) ===
        // If adding a NEW material (not editing) with initial stock and valid cost/vendor, record it as a Purchase.
        // Existing ID check logic: we used `id` from hidden field.
        // If hidden field was empty, it's new.
        const isEdit = !!document.getElementById('material-id').value;

        if (!isEdit && material.vendorId && stock > 0 && material.cost > 0) {
            const totalValue = stock * material.cost;
            window.DB.addVendorTransaction({
                vendorId: material.vendorId,
                type: 'purchase',
                amount: totalValue,
                description: `Initial Stock: ${material.name} (Qty: ${stock})`,
                date: new Date().toISOString().split('T')[0],
                method: 'credit' // Default to credit
            });
        }

        alert('Material saved successfully!');
        resetForm();

        // Clear search to ensure item shows up
        const searchBox = document.getElementById('searchBox');
        if (searchBox) {
            searchBox.value = '';
            // trigger input event or just reload
        }

        // Small delay to allow backend to persist stock
        setTimeout(loadInventory, 500);

    } catch (err) {
        console.error(err);
        alert('Unexpected Error saving material: ' + err.message);
    }
}

function editMaterial(id) {
    const material = window.DB.getIngredient(id);
    if (!material) return;

    document.getElementById('material-id').value = material.id;
    document.getElementById('material-name').value = material.name;
    document.getElementById('material-unit').value = material.unit;
    document.getElementById('material-cost').value = material.cost;
    document.getElementById('material-stock').value = material.stock;
    document.getElementById('material-expiration').value = material.expirationDate || "";
    document.getElementById('material-vendor').value = material.vendorId || "";
}

function deleteMaterial(id) {
    if (confirm('Are you sure you want to delete this material?')) {
        window.DB.deleteIngredient(id);
        loadInventory();
    }
}

function resetForm() {
    document.getElementById('inventory-form').reset();
    document.getElementById('material-id').value = '';
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
            <td id="rec-stock-${ing.id}">${parseFloat(ing.stock || 0).toFixed(3)}</td>
            <td>
                <input type="number" step="0.001" 
                       id="act-stock-${ing.id}" 
                       value="${parseFloat(ing.stock || 0)}" 
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

function saveStockAudit() {
    if (!confirm('Are you sure you want to update inventory stock levels?')) return;

    const ingredients = window.DB.getIngredients();
    let updatedCount = 0;

    ingredients.forEach(ing => {
        const actualInput = document.getElementById(`act-stock-${ing.id}`);
        if (actualInput) {
            const newStock = parseFloat(actualInput.value);
            // Update if valid and not NaN
            if (!isNaN(newStock) && Math.abs(newStock - ing.stock) > 0.0001) {
                // ing.stock = newStock; // Don't update local obj for file save
                // window.DB.saveIngredient(ing);

                // Use Backend Stock Update
                window.electronAPI.updateStock(ing.id, newStock);
                updatedCount++;
            }
        }
    });

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

// Restock Feature
window.openRestockModal = function (id) {
    const ing = window.DB.getIngredient(id);
    if (!ing) return;

    document.getElementById('restock-id').value = id;
    document.getElementById('restock-current-stock').textContent = ing.stock;
    document.getElementById('restock-current-cost').textContent = parseFloat(ing.cost || 0).toFixed(2);
    document.getElementById('restock-qty').value = '';
    document.getElementById('restock-cost').value = '';

    // Auto-fill cost if available from existing
    if (ing.cost > 0) document.getElementById('restock-cost').value = ing.cost;

    document.getElementById('restockModal').style.display = 'block';
};

window.confirmRestock = function () {
    const id = parseInt(document.getElementById('restock-id').value);
    const qty = parseFloat(document.getElementById('restock-qty').value);
    const newUnitCost = parseFloat(document.getElementById('restock-cost').value);
    const method = document.getElementById('restock-method').value; // cash or credit

    if (isNaN(qty) || qty <= 0) return alert('Invalid Quantity');
    if (isNaN(newUnitCost) || newUnitCost < 0) return alert('Invalid Cost');

    const ing = window.DB.getIngredient(id);
    if (!ing) return;

    const oldStock = parseFloat(ing.stock) || 0;
    const oldUnitCost = parseFloat(ing.cost) || 0;

    // === COST CALCULATION (Weighted Average) ===
    let finalUnitCost = newUnitCost;
    if (oldStock > 0) {
        // Simple Average as requested in previous project logic: (Old + New) / 2
        // Or Weighted: ((OldStock * OldCost) + (Qty * NewCost)) / (OldStock + Qty)
        // Services Code implemented: (OldCost + NewCost) / 2. We will stick to that for consistency unless it's obviously wrong.
        // Actually, Weighted Average is standard accounting. Let's use Weighted Average for accuracy.
        // Wait, the user specifically liked the Services logic. The Services code used a simple average but commented "User Spec".
        // Let's stick to Weighted Average it's safer, or simple average if desired.
        // Services Code: finalUnitCost = (oldUnitCost + newUnitCost) / 2;
        // Let's improve it to Weighted Average safely.

        const totalValue = (oldStock * oldUnitCost) + (qty * newUnitCost);
        finalUnitCost = totalValue / (oldStock + qty);
    }

    // ing.stock = oldStock + qty; // REMOVED: Stock updated via API
    ing.cost = parseFloat(finalUnitCost.toFixed(2));
    ing.lastRestockDate = new Date().toISOString();

    // Save Definition (Cost Update) - Clean Clone
    const ingToSave = { ...ing };
    delete ingToSave.stock; // Ensure stock is not overwritten in definition file

    if (window.DB.saveIngredient(ingToSave)) {
        // Update Stock via API
        window.electronAPI.updateStock(id, oldStock + qty);

        const totalPurchaseValue = qty * newUnitCost;

        // === VENDOR & FINANCIAL LOGIC ===
        if (ing.vendorId) {
            // 1. Log Purchase (Increases Vendor Debt)
            window.DB.addVendorTransaction({
                vendorId: ing.vendorId,
                type: 'purchase',
                amount: totalPurchaseValue,
                description: `Restock: ${ing.name} (${qty} x ${newUnitCost})`,
                date: new Date().toISOString().split('T')[0],
                method: method
            });

            // 2. If Cash, Log Payment (Decreases Vendor Debt immediately)
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
