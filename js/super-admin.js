// super-admin.js
const API_URL = '/api/super-admin';
let currentTenantId = null;

// Handle Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();
        if (response.ok) {
            localStorage.setItem('superAdminSecret', result.secret);
            showDashboard();
        } else {
            errorDiv.textContent = '❌ ' + (result.msg || 'Invalid credentials');
        }
    } catch (err) {
        errorDiv.textContent = '❌ Server error';
    }
});

function showDashboard() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'block';
    loadTenants();
}

async function loadTenants() {
    const secret = localStorage.getItem('superAdminSecret');
    if (!secret) return logout();

    try {
        const response = await fetch(`${API_URL}/tenants`, {
            headers: { 'x-super-admin-secret': secret }
        });

        if (response.status === 401) return logout();

        let tenants;
        try {
            tenants = await response.json();
            renderTenantsTable(tenants);
        } catch (e) {
            const text = await response.text();
            console.error('API Error (Non-JSON):', text);
            document.getElementById('tenants-table').innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Server Error: ${text || 'Unknown Error'}</td></tr>`;
        }
    } catch (err) {
        console.error('Failed to load tenants', err);
        document.getElementById('tenants-table').innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Connection Failed</td></tr>`;
    }
}

function renderTenantsTable(tenants) {
    const tbody = document.getElementById('tenants-table');
    tbody.innerHTML = '';

    tenants.forEach(tenant => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0";

        const expiryDate = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt) : new Date(tenant.trialEndsAt);
        const isExpired = new Date() > expiryDate;

        let statusClass = "bg-slate-100 text-slate-600 border-slate-200";
        let statusIcon = "help";

        if (tenant.status === 'active') {
            if (isExpired) {
                statusClass = "bg-red-50 text-red-600 border-red-100";
                statusIcon = "history"; // Expired
            } else {
                statusClass = "bg-green-50 text-green-600 border-green-100";
                statusIcon = "check_circle"; // Active
            }
        } else if (tenant.status === 'on_hold') {
            statusClass = "bg-amber-50 text-amber-600 border-amber-100";
            statusIcon = "pause_circle";
        }

        const statusLabel = tenant.status === 'active' ? (isExpired ? 'Expired' : 'Active') : tenant.status.replace('_', ' ');

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800 text-base">${tenant.businessName}</div>
                <div class="text-xs font-mono text-slate-400 mt-0.5">ID: ${tenant._id}</div>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-col gap-1 text-sm text-slate-600">
                    <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">mail</span> ${tenant.email}</span>
                    <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">call</span> ${tenant.phone}</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusClass} uppercase tracking-wide">
                    <span class="material-symbols-outlined text-[14px]">${statusIcon}</span>
                    ${statusLabel}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-slate-700">${expiryDate.toLocaleDateString()}</div>
                <div class="text-xs text-slate-400">${expiryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="updateStatus('${tenant._id}', '${tenant.status === 'active' ? 'on_hold' : 'active'}')" 
                            class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors border ${tenant.status === 'active' ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100' : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'}"
                            title="${tenant.status === 'active' ? 'Suspend' : 'Activate'}">
                        <span class="material-symbols-outlined text-[18px]">${tenant.status === 'active' ? 'pause' : 'play_arrow'}</span>
                    </button>
                    
                    <button onclick="openExtendModal('${tenant._id}', '${tenant.businessName}')" class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100" title="Extend Subscription">
                        <span class="material-symbols-outlined text-[18px]">update</span>
                    </button>
                    
                    <button onclick="openPasswordModal('${tenant._id}', '${tenant.businessName}')" class="w-8 h-8 flex items-center justify-center bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors border border-purple-100" title="Reset Password">
                        <span class="material-symbols-outlined text-[18px]">key</span>
                    </button>
                    
                    <button onclick="terminateTenant('${tenant._id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-100" title="Delete Tenant">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function updateStatus(id, status) {
    if (!confirm(`Are you sure you want to set status to ${status}?`)) return;
    const secret = localStorage.getItem('superAdminSecret');

    try {
        const response = await fetch(`${API_URL}/tenants/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-super-admin-secret': secret
            },
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            loadTenants();
        } else {
            const text = await response.text();
            alert('Error: ' + text);
        }
    } catch (err) { alert('Error updating status'); }
}

function openExtendModal(id, name) {
    currentTenantId = id;
    document.getElementById('extendBusinessName').textContent = name;
    document.getElementById('extendModal').style.display = 'flex';
}

async function confirmExtend() {
    const months = document.getElementById('extendDuration').value;
    const secret = localStorage.getItem('superAdminSecret');

    try {
        const response = await fetch(`${API_URL}/tenants/${currentTenantId}/subscription`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-super-admin-secret': secret
            },
            body: JSON.stringify({ months })
        });
        if (response.ok) {
            closeModal('extendModal');
            loadTenants();
        } else {
            const text = await response.text();
            alert('Error: ' + text);
        }
    } catch (err) { alert('Error extending subscription'); }
}

function openPasswordModal(id, name) {
    currentTenantId = id;
    document.getElementById('resetBusinessName').textContent = name;
    document.getElementById('passwordModal').style.display = 'flex';
}

async function confirmPasswordReset() {
    const newPassword = document.getElementById('newPassword').value;
    if (!newPassword || newPassword.length < 6) return alert('Password must be at least 6 characters');

    const secret = localStorage.getItem('superAdminSecret');
    try {
        const response = await fetch(`${API_URL}/tenants/${currentTenantId}/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-super-admin-secret': secret
            },
            body: JSON.stringify({ newPassword })
        });
        if (response.ok) {
            alert('Password reset successfully');
            closeModal('passwordModal');
            document.getElementById('newPassword').value = '';
        } else {
            const data = await response.json();
            alert('Error: ' + data.msg);
        }
    } catch (err) { alert('Error resetting password'); }
}

async function terminateTenant(id) {
    if (!confirm('☢️ CRITICAL: This will delete ALL data for this business. Are you absolutely sure?')) return;
    if (!confirm('Last chance: Confirm data deletion?')) return;

    const secret = localStorage.getItem('superAdminSecret');
    try {
        const response = await fetch(`${API_URL}/tenants/${id}`, {
            method: 'DELETE',
            headers: { 'x-super-admin-secret': secret }
        });
        if (response.ok) {
            alert('Tenant terminated');
            loadTenants();
        } else {
            const text = await response.text();
            alert('Error: ' + text);
        }
    } catch (err) { alert('Error terminating tenant'); }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    currentTenantId = null;
}

function logout() {
    localStorage.removeItem('superAdminSecret');
    location.reload();
}

// Check session on load
if (localStorage.getItem('superAdminSecret')) {
    showDashboard();
}
