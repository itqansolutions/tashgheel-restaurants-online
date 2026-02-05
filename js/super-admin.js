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

        const tenants = await response.json();
        renderTenantsTable(tenants);
    } catch (err) {
        console.error('Failed to load tenants', err);
    }
}

function renderTenantsTable(tenants) {
    const tbody = document.getElementById('tenants-table');
    tbody.innerHTML = '';

    tenants.forEach(tenant => {
        const tr = document.createElement('tr');

        const expiryDate = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt) : new Date(tenant.trialEndsAt);
        const isExpired = new Date() > expiryDate;

        const statusClass = tenant.status === 'active' ? (isExpired ? 'status-suspended' : 'status-active') : `status-${tenant.status}`;
        const statusLabel = tenant.status === 'active' ? (isExpired ? 'Expired' : 'Active') : tenant.status.replace('_', ' ');

        tr.innerHTML = `
            <td>
                <strong>${tenant.businessName}</strong><br>
                <small style="color:#666;">ID: ${tenant._id}</small>
            </td>
            <td>
                📧 ${tenant.email}<br>
                📱 ${tenant.phone}
            </td>
            <td>
                <span class="status-badge ${statusClass}">${statusLabel}</span>
            </td>
            <td>
                ${expiryDate.toLocaleDateString()} ${expiryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </td>
            <td>
                <button onclick="updateStatus('${tenant._id}', '${tenant.status === 'active' ? 'on_hold' : 'active'}')" class="btn-sm ${tenant.status === 'active' ? 'btn-warning' : 'btn-success'}">
                    ${tenant.status === 'active' ? '⏸️ Hold' : '▶️ Activate'}
                </button>
                <button onclick="openExtendModal('${tenant._id}', '${tenant.businessName}')" class="btn-sm btn-info">⏳ Extend</button>
                <button onclick="openPasswordModal('${tenant._id}', '${tenant.businessName}')" class="btn-sm btn-primary">🔑 Pass</button>
                <button onclick="terminateTenant('${tenant._id}')" class="btn-sm btn-danger">🗑️ Terminate</button>
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
        if (response.ok) loadTenants();
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
