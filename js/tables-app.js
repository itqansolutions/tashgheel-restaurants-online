/**
 * Tables Admin App
 *
 * Dedicated tables management page (separate from dine-in ordering).
 * Allows staff to create, edit, and archive tables for a branch.
 * Uses the same /api/tables backend as dine-in-app.js.
 */

(function () {
    'use strict';

    let tables = [];
    let archiveTargetId = null;

    // ─── Boot ───────────────────────────────────────────────────────────
    async function init() {
        await loadTables();
    }

    // ─── Load & Render ───────────────────────────────────────────────────
    async function loadTables() {
        try {
            const data = await apiFetch('/tables');
            tables = Array.isArray(data) ? data : [];
            renderStats();
            renderGrid();
        } catch (e) {
            showToast('Failed to load tables: ' + e.message, 'error');
            document.getElementById('tables-grid').innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 text-slate-600">
                    <span class="material-symbols-outlined text-5xl mb-3">error</span>
                    <p class="text-sm">${e.message}</p>
                </div>`;
        }
    }

    function renderStats() {
        const available = tables.filter(t => t.status === 'available').length;
        const occupied = tables.filter(t => t.status === 'occupied').length;
        const seats = tables.reduce((s, t) => s + (t.capacity || 0), 0);

        document.getElementById('stat-total').textContent = tables.length;
        document.getElementById('stat-available').textContent = available;
        document.getElementById('stat-occupied').textContent = occupied;
        document.getElementById('stat-seats').textContent = seats;
    }

    function renderGrid() {
        const grid = document.getElementById('tables-grid');

        if (tables.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 text-slate-600">
                    <span class="material-symbols-outlined text-5xl mb-3">table_restaurant</span>
                    <p class="font-semibold mb-2">No tables yet</p>
                    <p class="text-sm mb-6">Click "Add Table" to create your first table</p>
                </div>`;
            return;
        }

        grid.innerHTML = tables.map(t => {
            const isOccupied = t.status === 'occupied';
            const statusColor = isOccupied
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-green-500/20 text-green-400 border-green-500/40';
            const statusLabel = isOccupied ? 'Occupied' : 'Available';
            const statusDot = isOccupied
                ? 'bg-amber-400 animate-pulse'
                : 'bg-green-400';

            // QR URL preview
            const qrPreview = `?code=${t.code}&branch=<branchId>`;

            return `
                <div class="bg-slate-800 rounded-2xl border ${isOccupied ? 'border-amber-500/30' : 'border-slate-700/50'} p-5 flex flex-col gap-4 transition-all">
                    <!-- Top row -->
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl ${isOccupied ? 'bg-amber-500/20' : 'bg-slate-700'} flex items-center justify-center">
                                <span class="material-symbols-outlined ${isOccupied ? 'text-amber-400' : 'text-slate-400'}">table_restaurant</span>
                            </div>
                            <div>
                                <h3 class="font-bold text-white text-sm leading-tight">${t.name}</h3>
                                <p class="text-xs text-slate-500 font-mono mt-0.5">${t.code}</p>
                            </div>
                        </div>
                        <span class="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${statusColor}">
                            <span class="w-1.5 h-1.5 rounded-full ${statusDot}"></span>
                            ${statusLabel}
                        </span>
                    </div>

                    <!-- Seat count -->
                    <div class="flex items-center gap-2 text-sm text-slate-400">
                        <span class="material-symbols-outlined text-base">chair</span>
                        <span>${t.capacity || 0} seat${t.capacity !== 1 ? 's' : ''}</span>
                    </div>

                    <!-- QR code preview -->
                    <div class="bg-slate-900 rounded-lg px-3 py-2 text-[10px] text-slate-500 font-mono truncate" title="QR URL: table-order.html${qrPreview}">
                        table-order.html${qrPreview}
                    </div>

                    <!-- Actions -->
                    <div class="flex gap-2 pt-1">
                        <button onclick="TablesAdmin.openEditModal('${t._id}')"
                            class="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-colors ${isOccupied ? 'opacity-50 cursor-not-allowed' : ''}"
                            ${isOccupied ? 'disabled title="Cannot edit while table is occupied"' : ''}>
                            <span class="material-symbols-outlined text-sm">edit</span>
                            Edit
                        </button>
                        <button onclick="TablesAdmin.openArchiveModal('${t._id}', '${t.name.replace(/'/g, "\\'")}')"
                            class="flex items-center justify-center gap-1.5 px-3 py-2 ${isOccupied ? 'bg-slate-700/50 text-slate-600 cursor-not-allowed' : 'bg-red-500/10 hover:bg-red-500/20 text-red-400'} text-xs font-bold rounded-xl transition-colors"
                            ${isOccupied ? 'disabled title="Close bill first"' : ''}>
                            <span class="material-symbols-outlined text-sm">archive</span>
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    // ─── Modal: Add ──────────────────────────────────────────────────────
    function openAddModal() {
        document.getElementById('modal-title').textContent = 'Add Table';
        document.getElementById('edit-table-id').value = '';
        document.getElementById('field-name').value = '';
        document.getElementById('field-code').value = '';
        document.getElementById('field-capacity').value = '4';
        document.getElementById('modal-error').classList.add('hidden');
        document.getElementById('modal-save-btn').textContent = 'Save Table';
        document.getElementById('table-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('field-name').focus(), 100);

        // Auto-suggest code when name is typed
        document.getElementById('field-name').oninput = function () {
            if (!document.getElementById('field-code').value) {
                // Generate a short code from name: "Table 5" → "T5"
                const raw = this.value.trim();
                const suggested = raw
                    .replace(/table/i, 'T')
                    .replace(/\s+/g, '')
                    .toUpperCase()
                    .slice(0, 8);
                document.getElementById('field-code').value = suggested;
            }
        };
    }

    // ─── Modal: Edit ─────────────────────────────────────────────────────
    function openEditModal(tableId) {
        const table = tables.find(t => t._id === tableId);
        if (!table) return;

        document.getElementById('modal-title').textContent = 'Edit Table';
        document.getElementById('edit-table-id').value = tableId;
        document.getElementById('field-name').value = table.name;
        document.getElementById('field-code').value = table.code;
        document.getElementById('field-capacity').value = table.capacity || 4;
        document.getElementById('modal-error').classList.add('hidden');
        document.getElementById('modal-save-btn').textContent = 'Save Changes';
        document.getElementById('field-name').oninput = null; // no auto-suggest on edit
        document.getElementById('table-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('field-name').focus(), 100);
    }

    function closeModal() {
        document.getElementById('table-modal').classList.add('hidden');
    }

    function adjustSeats(delta) {
        const el = document.getElementById('field-capacity');
        const current = parseInt(el.value) || 4;
        el.value = Math.max(1, Math.min(50, current + delta));
    }

    // ─── Save (Create or Update) ─────────────────────────────────────────
    async function saveTable() {
        const id = document.getElementById('edit-table-id').value;
        const name = document.getElementById('field-name').value.trim();
        const code = document.getElementById('field-code').value.trim().toUpperCase();
        const capacity = parseInt(document.getElementById('field-capacity').value) || 4;
        const errEl = document.getElementById('modal-error');

        if (!name || !code) {
            errEl.textContent = 'Name and code are required.';
            errEl.classList.remove('hidden');
            return;
        }
        if (!/^[A-Z0-9]{1,10}$/.test(code)) {
            errEl.textContent = 'Code must be alphanumeric, max 10 chars (e.g. T1, VIP).';
            errEl.classList.remove('hidden');
            return;
        }

        const btn = document.getElementById('modal-save-btn');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        errEl.classList.add('hidden');

        try {
            if (id) {
                // Update
                await apiFetch(`/tables/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, capacity })
                });
                showToast(`✅ "${name}" updated`, 'success');
            } else {
                // Create
                await apiFetch('/tables', {
                    method: 'POST',
                    body: JSON.stringify({ name, code, capacity })
                });
                showToast(`✅ "${name}" added`, 'success');
            }
            closeModal();
            await loadTables();
        } catch (e) {
            errEl.textContent = e.message || 'Could not save table.';
            errEl.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = id ? 'Save Changes' : 'Save Table';
        }
    }

    // ─── Archive ─────────────────────────────────────────────────────────
    function openArchiveModal(tableId, tableName) {
        archiveTargetId = tableId;
        document.getElementById('archive-table-name').textContent = tableName;
        document.getElementById('archive-modal').classList.remove('hidden');
    }

    async function confirmArchive() {
        if (!archiveTargetId) return;
        const btn = document.getElementById('archive-confirm-btn');
        btn.disabled = true;
        btn.textContent = 'Archiving...';

        try {
            await apiFetch(`/tables/${archiveTargetId}`, { method: 'DELETE' });
            showToast('Table archived', 'success');
            document.getElementById('archive-modal').classList.add('hidden');
            archiveTargetId = null;
            await loadTables();
        } catch (e) {
            showToast(e.message || 'Cannot archive. Close the bill first.', 'error');
            document.getElementById('archive-modal').classList.add('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Archive';
        }
    }

    // ─── Toast ───────────────────────────────────────────────────────────
    let toastTimer;
    function showToast(msg, type = 'info') {
        const toast = document.getElementById('toast');
        const inner = document.getElementById('toast-inner');
        const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-slate-700' };
        inner.className = `px-5 py-3 rounded-xl text-white text-sm font-semibold shadow-2xl ${colors[type] || 'bg-slate-700'}`;
        inner.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // ─── Expose & Boot ───────────────────────────────────────────────────
    window.TablesAdmin = {
        openAddModal, openEditModal, closeModal,
        adjustSeats, saveTable,
        openArchiveModal, confirmArchive
    };

    document.addEventListener('DOMContentLoaded', init);

})();
