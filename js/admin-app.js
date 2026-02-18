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

  async function loadUsers() {
    if (window.apiFetchUsers) {
      try { await window.apiFetchUsers(); } catch (e) { console.error(e); }
    }

    // Fallback or use updated cache
    const users = typeof getActiveUsers === 'function' ? getActiveUsers() : [];
    userTableBody.innerHTML = '';

    if (users.length === 0) {
      userTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#777;">No active users found.</td></tr>';
      return;
    }

    users.forEach((user) => {
      const row = document.createElement('tr');
      row.className = "hover:bg-slate-50 transition-colors group";

      // Badge logic
      let badgeClass = "bg-slate-100 text-slate-600";
      if (user.role === 'admin') badgeClass = "bg-red-100 text-red-700 border border-red-200";
      else if (user.role === 'manager') badgeClass = "bg-purple-100 text-purple-700 border border-purple-200";
      else if (user.role === 'cashier') badgeClass = "bg-green-100 text-green-700 border border-green-200";

      row.innerHTML = `
        <td class="px-4 py-3">
            <div class="font-bold text-slate-800">${user.username}</div>
            <div class="text-xs text-slate-500">${user.fullName || user.username}</div>
        </td>
        <td class="px-4 py-3">
            <span class="inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${badgeClass}">${user.role}</span>
        </td>
        <td class="px-4 py-3 text-right">
             ${user.username !== 'admin' ?
          `<button onclick="handleDeleteUser('${user.id}')" class="w-8 h-8 inline-flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-100" title="Delete"><span class="material-symbols-outlined text-[16px]">delete</span></button>` :
          `<span class="text-xs text-slate-300 italic">Protected</span>`
        }
        </td>
      `;
      userTableBody.appendChild(row);
    });
  }

  window.handleDeleteUser = async function (id) {
    try {
      const confirmed = await confirm("Are you sure you want to delete this user?");
      if (!confirmed) return;

      await deleteUser(id);
      await loadUsers();
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

  userForm.addEventListener('submit', async (e) => {
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
      await addUser({
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

      await loadUsers();
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

  // === Store Link Logic ===
  const storeLinkInput = document.getElementById('store-link-display');
  const storeLinkBtn = document.getElementById('store-link-btn');

  function updateStoreLink() {
    if (!storeLinkInput) return;

    // Get current Tenant ID from user context (injected by auth.js usually)
    const user = window.getCurrentUser();
    const tenantId = user ? user.tenantId : 'global';

    // Construct Link
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/online_ordering.html?oid=${tenantId}`;

    storeLinkInput.value = link;
    storeLinkBtn.href = link;
  }

  window.copyStoreLink = function () {
    if (!storeLinkInput) return;
    storeLinkInput.select();
    navigator.clipboard.writeText(storeLinkInput.value).then(() => {
      showToast('✅ Link copied to clipboard');
    }).catch(err => {
      console.error('Copy failed', err);
      showToast('❌ Copy failed');
    });
  };

  // call on load
  updateStoreLink();

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
          // Use new dedicated API
          branches = await window.apiFetch('/branches');
        } catch (e) {
          console.warn('Fallback to legacy/local branches');
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
          row.className = "hover:bg-slate-50 transition-colors group";

          row.innerHTML = `
          <td class="px-4 py-3">
            <div class="font-bold text-slate-800">${branch.name || 'Unnamed'}</div>
            <div class="text-xs text-slate-500">${branch.address || '-'}</div>
          </td>
          <td class="px-4 py-3">
              <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-xs font-mono font-bold border border-blue-100">${branch.code || '-'}</span>
          </td>
          <td class="px-4 py-3 text-slate-600 text-sm">${branch.phone || '-'}</td>
          <td class="px-4 py-3 text-slate-600 text-sm">${branch.settings?.taxRate || branch.taxRate || 0}%</td>
          <td class="px-4 py-3 text-right">
            <button onclick="handleDeleteBranch('${branchId}')" class="w-8 h-8 inline-flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-100" title="Delete"><span class="material-symbols-outlined text-[16px]">delete</span></button>
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
        await window.apiFetch(`/branches/${branchId}`, { method: 'DELETE' });
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
        name, code, phone, address, isActive: true,
        settings: { taxRate, currency: 'EGP' } // Backend handles creation date/id
      };

      try {
        if (window.apiFetch) {
          await window.apiFetch('/branches', {
            method: 'POST',
            body: JSON.stringify(newBranch)
          });
        } else {
          // Local Fallback
          const branches = JSON.parse(localStorage.getItem('branches') || '[]');
          newBranch.id = 'branch_' + Date.now();
          branches.push(newBranch);
          localStorage.setItem('branches', JSON.stringify(branches));
        }

        showToast('✅ Branch created!');
        branchForm.reset();
        loadBranches();
      } catch (e) {
        console.error(e);
        alert('Error: ' + (e.message || 'Failed to create branch'));
      }
    });
  }

  loadBranches();

  // === Tax Management ===
  const taxForm = document.getElementById('tax-form');
  const taxTableBody = document.getElementById('tax-table-body');

  async function loadTaxes() {
    try {
      let taxes = [];
      if (window.apiFetch) {
        const result = await window.apiFetch('/taxes');
        taxes = result || [];
      } else {
        console.warn('Tax API not available in local mode');
        return;
      }

      if (taxTableBody) {
        taxTableBody.innerHTML = '';
        if (taxes.length === 0) {
          taxTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#777;">No taxes configured.</td></tr>';
          return;
        }

        taxes.forEach(tax => {
          const row = document.createElement('tr');
          row.className = "hover:bg-slate-50 transition-colors group";

          const statusBadge = tax.enabled
            ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">Enabled</span>'
            : '<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-xs font-bold">Disabled</span>';

          row.innerHTML = `
             <td class="px-4 py-3 font-bold text-slate-800">${tax.name}</td>
             <td class="px-4 py-3 font-mono text-slate-600">${tax.percentage}%</td>
             <td class="px-4 py-3">
                <div class="flex flex-col gap-1">
                  ${statusBadge}
                  <span class="text-[10px] text-slate-400">
                    ${!tax.orderTypes || tax.orderTypes.length === 3 ? 'All Types' : tax.orderTypes.map(t => t.replace('dine_in', 'Din').replace('take_away', 'TkPv').replace('delivery', 'Del')).join(', ')}
                  </span>
                </div>
             </td>
             <td class="px-4 py-3 text-right">
                <button onclick="handleDeleteTax('${tax._id}')" class="w-8 h-8 inline-flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-100" title="Delete">
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
             </td>
           `;
          taxTableBody.appendChild(row);
        });
      }
    } catch (e) {
      console.error('Error loading taxes:', e);
    }
  }

  if (taxForm) {
    taxForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('tax-name').value.trim();
      const percentage = parseFloat(document.getElementById('tax-percentage').value);
      const enabled = document.getElementById('tax-enabled').checked;

      // Gather Order Types
      const orderTypes = Array.from(document.querySelectorAll('input[name="tax-scope"]:checked')).map(cb => cb.value);

      if (!name || isNaN(percentage)) return alert('Invalid inputs');

      try {
        await window.apiFetch('/taxes', {
          method: 'POST',
          body: JSON.stringify({ name, percentage, enabled, orderTypes })
        });
        showToast('✅ Tax saved!');
        taxForm.reset();
        document.getElementById('tax-enabled').checked = true; // Reset default
        loadTaxes();
      } catch (e) {
        alert('Error saving tax: ' + e.message);
      }
    });
  }

  window.handleDeleteTax = async function (id) {
    if (!confirm('Delete this tax?')) return;
    try {
      await window.apiFetch(`/api/taxes/${id}`, { method: 'DELETE' });
      showToast('🗑️ Tax deleted');
      loadTaxes();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // Initial Load
  if (window.apiFetch) loadTaxes();

});
