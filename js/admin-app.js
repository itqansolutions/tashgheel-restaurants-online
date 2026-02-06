// admin-app.js
// Local translations removed, using global translations.js

// admin-app.js
// Local translations removed, using global translations.js

document.addEventListener('DOMContentLoaded', () => {
  // === Shop Settings ===
  const shopNameInput = document.getElementById('shop-name');

  // Show User Info in Header
  const user = window.getCurrentUser();
  if (user) {
    const nameEl = document.getElementById('currentUserName');
    const roleEl = document.getElementById('userRole');
    if (nameEl) nameEl.textContent = user.fullName;
    if (roleEl) roleEl.textContent = user.role;
  }
  const shopAddressInput = document.getElementById('shop-address');
  const shopLogoInput = document.getElementById('shop-logo');
  const logoPreview = document.getElementById('logo-preview');
  const logoPlaceholder = document.getElementById('logo-placeholder');
  const shopForm = document.getElementById('shop-settings-form');
  const footerMessageInput = document.getElementById('footer-message');

  let uploadedLogoBase64 = '';
  const savedName = localStorage.getItem('shopName');
  const savedAddress = localStorage.getItem('shopAddress');
  const savedLogo = localStorage.getItem('shopLogo');
  const savedFooter = localStorage.getItem('footerMessage');

  if (savedName) shopNameInput.value = savedName;
  if (savedAddress) shopAddressInput.value = savedAddress;
  if (savedLogo) {
    logoPreview.src = savedLogo;
    logoPreview.style.display = 'block';
    if (logoPlaceholder) logoPlaceholder.style.display = 'none';
    uploadedLogoBase64 = savedLogo;
  }
  if (savedFooter) footerMessageInput.value = savedFooter;

  shopLogoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        uploadedLogoBase64 = reader.result;
        logoPreview.src = uploadedLogoBase64;
        logoPreview.style.display = 'block';
        if (logoPlaceholder) logoPlaceholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
  });

  shopForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
      shopName: shopNameInput.value.trim(),
      shopAddress: shopAddressInput.value.trim(),
      footerMessage: footerMessageInput.value.trim(),
      shopLogo: uploadedLogoBase64.startsWith('data:image') ? uploadedLogoBase64 : '' // Ensure valid data URI
    };

    // Save to EnhancedSecurity for secure persistence
    if (window.EnhancedSecurity && window.EnhancedSecurity.storeSecureData) {
      window.EnhancedSecurity.storeSecureData('shop_settings', settings);
      // If Electron, also try to save generic settings if we had a dedicated key, but 'shop_settings' works.
      // We also sync to legacy keys for compatibility
    }

    // Also save to localStorage for immediate UI updates
    localStorage.setItem('shopName', settings.shopName);
    localStorage.setItem('shopAddress', settings.shopAddress);
    localStorage.setItem('footerMessage', settings.footerMessage);
    if (settings.shopLogo) {
      localStorage.setItem('shopLogo', settings.shopLogo);
    }

    showToast('✅ Settings saved successfully!');
  });

  // === User Management ===
  const userForm = document.getElementById('user-form');
  const usernameInput = document.getElementById('new-username');
  const passwordInput = document.getElementById('new-password');
  const fullnameInput = document.getElementById('new-fullname'); // Added
  const roleSelect = document.getElementById('user-role');
  const userTableBody = document.getElementById('user-table-body');

  function loadUsers() {
    const users = getActiveUsers();
    userTableBody.innerHTML = '';

    if (users.length === 0) {
      userTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#777;">No active users found.</td></tr>';
      return;
    }

    users.forEach((user) => {
      const row = document.createElement('tr');
      // Badge class based on role
      const badgeClass = `role-${user.role}`;

      row.innerHTML = `
        <td>
            <div style="font-weight:bold;">${user.username}</div>
            <div style="font-size:0.85em; color:#777;">${user.fullName || user.username}</div>
        </td>
        <td><span class="role-badge ${badgeClass}">${user.role}</span></td>
        <td style="text-align:right;">
             ${user.username !== 'admin' ?
          `<button onclick="handleDeleteUser(${user.id})" class="btn btn-sm btn-danger" title="Delete">🗑️</button>` :
          `<span style="color:#aaa; font-size:0.8em;">Protected</span>`
        }
        </td>
      `;
      userTableBody.appendChild(row);
    });
  }

  window.handleDeleteUser = function (id) {
    try {
      const confirmed = confirm("Are you sure you want to delete this user?");
      if (!confirmed) return;
      deleteUser(id);
      loadUsers();
      showToast('User deleted.');
    } catch (e) {
      alert(e.message);
    }
  };

  // Toggle Other Role in Admin
  window.toggleAdminRoleOther = function () {
    const val = document.getElementById('user-role-select').value;
    const other = document.getElementById('user-role-other');
    if (val === 'Other') {
      other.style.display = 'block';
      other.focus();
    } else {
      other.style.display = 'none';
      other.value = '';
    }
  };

  userForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const fullName = fullnameInput.value.trim();

    // Role Logic
    let role = document.getElementById('user-role-select').value;
    if (role === 'Other') {
      role = document.getElementById('user-role-other').value.trim();
    }

    const allowedPages = Array.from(document.querySelectorAll('input[name="access"]:checked')).map(cb => cb.value);

    // Get selected branch
    const branchSelect = document.getElementById('user-branch-select');
    const assignedBranchId = branchSelect ? branchSelect.value : '';

    if (!username || !password || !fullName || !role) return alert('Fill all fields');

    try {
      addUser({
        username,
        password,
        role,
        fullName: fullName,
        allowedPages,
        branchIds: assignedBranchId ? [assignedBranchId] : [],
        defaultBranchId: assignedBranchId || null
      });

      showToast('✅ User created successfully');
      userForm.reset();
      // Reset checkboxes
      document.querySelectorAll('input[name="access"]').forEach(cb => cb.checked = false);

      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  });

  loadUsers();

  function showToast(msg) {
    // Simple custom toast to avoid alert
    const div = document.createElement('div');
    div.innerText = msg;
    div.style.position = 'fixed';
    div.style.bottom = '20px';
    div.style.right = '20px';
    div.style.backgroundColor = '#333';
    div.style.color = '#fff';
    div.style.padding = '12px 24px';
    div.style.borderRadius = '8px';
    div.style.zIndex = '9999';
    div.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
    document.body.appendChild(div);
    setTimeout(() => {
      div.style.transition = 'opacity 0.5s';
      div.style.opacity = '0';
      setTimeout(() => div.remove(), 500);
    }, 3000);
  }

  // Re-render when language changes
  window.addEventListener('languageChanged', () => {
    // loadUsers(); 
  });

  // === Branch Management ===
  const branchForm = document.getElementById('branch-form');
  const branchTableBody = document.getElementById('branch-table-body');

  async function loadBranches() {
    try {
      let branches = [];
      if (window.apiFetch) {
        try {
          const result = await window.apiFetch('/data/load?collection=branches');
          branches = result.data || [];
        } catch (e) {
          branches = JSON.parse(localStorage.getItem('branches') || '[]');
        }
      } else {
        branches = JSON.parse(localStorage.getItem('branches') || '[]');
      }

      // Populate branch table (if exists)
      if (branchTableBody) {
        branchTableBody.innerHTML = '';

        if (branches.length === 0) {
          branchTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#777;">No branches yet. Add one above!</td></tr>';
          return;
        }

        branches.forEach((branch) => {
          const row = document.createElement('tr');
          const branchId = branch._id || branch.id;

          row.innerHTML = `
          <td>
            <div style="font-weight:bold;">${branch.name || 'Unnamed'}</div>
            <div style="font-size:0.85em; color:#777;">${branch.address || '-'}</div>
          </td>
          <td><span style="background:#e0e7ff; color:#4338ca; padding:2px 8px; border-radius:12px; font-size:0.8rem; font-weight:bold;">${branch.code || '-'}</span></td>
          <td>${branch.phone || '-'}</td>
          <td>${branch.settings?.taxRate || branch.taxRate || 0}%</td>
          <td style="text-align:right;">
            <button onclick="handleDeleteBranch('${branchId}')" class="btn btn-sm btn-danger" title="Delete" style="padding:4px 8px; font-size:0.8rem;">🗑️</button>
          </td>
        `;
          branchTableBody.appendChild(row);
        });
      }

      // Also populate user branch dropdown (if exists)
      const userBranchSelect = document.getElementById('user-branch-select');
      if (userBranchSelect) {
        userBranchSelect.innerHTML = '<option value="">-- Select Branch --</option>';
        branches.forEach(branch => {
          const opt = document.createElement('option');
          opt.value = branch._id || branch.id;
          opt.textContent = branch.name + (branch.code ? ` (${branch.code})` : '');
          userBranchSelect.appendChild(opt);
        });
      }

    } catch (e) {
      console.error('Error loading branches:', e);
    }
  }

  window.handleDeleteBranch = async function (branchId) {
    if (!confirm('Delete this branch?')) return;

    try {
      if (window.apiFetch) {
        await window.apiFetch(`/data/delete?collection=branches&id=${branchId}`, { method: 'DELETE' });
      } else {
        let branches = JSON.parse(localStorage.getItem('branches') || '[]');
        branches = branches.filter(b => (b._id || b.id) !== branchId);
        localStorage.setItem('branches', JSON.stringify(branches));
      }
      showToast('🗑️ Branch deleted');
      loadBranches();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  if (branchForm) {
    branchForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('branch-name').value.trim();
      const code = document.getElementById('branch-code').value.trim().toUpperCase();
      const phone = document.getElementById('branch-phone').value.trim();
      const address = document.getElementById('branch-address').value.trim();
      const taxRate = parseFloat(document.getElementById('branch-tax').value) || 0;

      if (!name || !code) return alert('Name and code required');

      const newBranch = {
        id: 'branch_' + Date.now(),
        name, code, phone, address, isActive: true,
        settings: { taxRate, currency: 'EGP' }
      };

      try {
        if (window.apiFetch) {
          await window.apiFetch('/data/save', {
            method: 'POST',
            body: JSON.stringify({ collection: 'branches', data: newBranch })
          });
        } else {
          const branches = JSON.parse(localStorage.getItem('branches') || '[]');
          branches.push(newBranch);
          localStorage.setItem('branches', JSON.stringify(branches));
        }

        showToast('✅ Branch created!');
        branchForm.reset();
        loadBranches();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });
  }

  loadBranches();
});
