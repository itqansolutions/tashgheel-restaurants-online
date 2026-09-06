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
  const deadStockDaysInput = document.getElementById('dead-stock-days');

  let uploadedLogoBase64 = '';

  function loadShopSettingsFromStorage() {
    const savedName = localStorage.getItem('shopName');
    const savedAddress = localStorage.getItem('shopAddress');
    const savedLogo = localStorage.getItem('shopLogo');
    const savedFooter = localStorage.getItem('footerMessage');
    const s = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const savedDeadStock = s.deadStockDays || '';

    if (savedName && shopNameInput) shopNameInput.value = savedName;
    if (savedAddress && shopAddressInput) shopAddressInput.value = savedAddress;
    if (savedLogo && logoPreview) {
      logoPreview.src = savedLogo;
      logoPreview.style.display = 'block';
      if (logoPlaceholder) logoPlaceholder.style.display = 'none';
      uploadedLogoBase64 = savedLogo;
    }
    if (savedFooter && footerMessageInput) footerMessageInput.value = savedFooter;
    if (deadStockDaysInput) deadStockDaysInput.value = savedDeadStock;
  }

  loadShopSettingsFromStorage();

  // Reload everything on SystemDataReady event
  window.addEventListener('SystemDataReady', () => {
    loadShopSettingsFromStorage();
    if (typeof loadFeatureToggles === 'function') loadFeatureToggles();
    if (typeof loadPinStatus === 'function') loadPinStatus();
  });

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

    // Preserve existing feature toggles when re-saving shop settings
    const existingSettings = window.EnhancedSecurity?.getSecureData('shop_settings') || {};

    const settings = {
      ...existingSettings, // Preserve all existing fields including feature flags
      shopName: shopNameInput.value.trim(),
      shopAddress: shopAddressInput.value.trim(),
      footerMessage: footerMessageInput.value.trim(),
      deadStockDays: parseInt(deadStockDaysInput?.value) || 30,
      shopLogo: uploadedLogoBase64.startsWith('data:image') ? uploadedLogoBase64 : (existingSettings.shopLogo || '')
    };

    // Save to EnhancedSecurity for secure persistence
    if (window.EnhancedSecurity && window.EnhancedSecurity.storeSecureData) {
      window.EnhancedSecurity.storeSecureData('shop_settings', settings);
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

  // === Feature Toggles ===
  // Load current feature toggle states
  function loadFeatureToggles() {
    const s = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const kitchenToggle = document.getElementById('toggle-kitchen');
    const dineinToggle = document.getElementById('toggle-dinein');
    if (kitchenToggle) kitchenToggle.checked = s.enableKitchen !== false; // Default true
    if (dineinToggle) dineinToggle.checked = s.enableDineIn !== false;   // Default true
  }
  loadFeatureToggles();

  // Save feature toggle on change (global so onchange= in HTML can call it)
  window.saveFeatureToggles = function () {
    const existing = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const kitchenToggle = document.getElementById('toggle-kitchen');
    const dineinToggle = document.getElementById('toggle-dinein');
    const updated = {
      ...existing,
      enableKitchen: kitchenToggle ? kitchenToggle.checked : true,
      enableDineIn: dineinToggle ? dineinToggle.checked : true
    };
    if (window.EnhancedSecurity?.storeSecureData) {
      window.EnhancedSecurity.storeSecureData('shop_settings', updated);
    }
    const kitchenLabel = kitchenToggle?.checked ? 'enabled' : 'disabled';
    showToast(`✅ Kitchen feature ${kitchenLabel}. Changes apply on next page load.`);
  };

  // === Manager PIN ===
  function loadPinStatus() {
    const s = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const statusEl = document.getElementById('pin-status');
    if (statusEl) {
      statusEl.textContent = s.managerPin
        ? `✅ Manager PIN is set (${s.managerPin.length} digits). Staff will be prompted before hard actions.`
        : '⬜ No PIN set — hard actions (discount, remove item, cancel) require no confirmation.';
      statusEl.className = s.managerPin ? 'text-xs text-green-600 font-semibold' : 'text-xs text-slate-500';
    }
  }
  loadPinStatus();

  window.saveManagerPin = function () {
    const pin = document.getElementById('manager-pin-input')?.value.trim();
    const confirm = document.getElementById('manager-pin-confirm')?.value.trim();
    if (!pin) { showToast('❌ PIN cannot be empty. Use "Remove PIN" to disable.', 'error'); return; }
    if (pin.length < 4) { showToast('❌ PIN must be at least 4 digits.', 'error'); return; }
    if (!/^\d+$/.test(pin)) { showToast('❌ PIN must contain only numbers.', 'error'); return; }
    if (pin !== confirm) { showToast('❌ PINs do not match. Please re-enter.', 'error'); return; }

    const existing = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    window.EnhancedSecurity?.storeSecureData('shop_settings', { ...existing, managerPin: pin });
    document.getElementById('manager-pin-input').value = '';
    document.getElementById('manager-pin-confirm').value = '';
    loadPinStatus();
    showToast('✅ Manager PIN saved. Staff will be prompted for hard actions.');
  };

  window.clearManagerPin = function () {
    if (!confirm('Remove the Manager PIN? Hard actions will no longer require authorization.')) return;
    const existing = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    delete existing.managerPin;
    window.EnhancedSecurity?.storeSecureData('shop_settings', existing);
    loadPinStatus();
    showToast('✅ Manager PIN removed. Hard actions now require no PIN.');
  };

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
  let currentLoadedTaxes = [];

  async function loadTaxes() {
    try {
      let taxes = [];
      if (window.apiFetch) {
        const result = await window.apiFetch('/taxes');
        taxes = result || [];
        currentLoadedTaxes = taxes;
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
          const taxId = tax.id || tax._id;
          const row = document.createElement('tr');
          row.className = "hover:bg-slate-50 transition-colors group";

          const statusBadge = tax.enabled
            ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">Enabled</span>'
            : '<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-xs font-bold">Disabled</span>';

          let types = [];
          if (Array.isArray(tax.orderTypes)) types = tax.orderTypes;
          else if (typeof tax.orderTypes === 'string') {
            try { types = JSON.parse(tax.orderTypes); } catch(e) { types = []; }
          }

          let scopeBadges = '';
          if (!types || types.length === 0) {
            scopeBadges = '<span class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">None</span>';
          } else if (types.length === 3) {
            scopeBadges = '<span class="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">All Types</span>';
          } else {
            scopeBadges = types.map(t => {
              const label = t === 'dine_in' ? 'Dine In' : (t === 'take_away' ? 'Take Away' : 'Delivery');
              return `<span class="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">${label}</span>`;
            }).join(' ');
          }

          row.innerHTML = `
             <td class="px-4 py-3 font-bold text-slate-800">${tax.name}</td>
             <td class="px-4 py-3 font-mono text-slate-600">${tax.percentage}%</td>
             <td class="px-4 py-3">
                <div class="flex flex-col gap-1.5">
                  <div>${statusBadge}</div>
                  <div class="flex flex-wrap gap-1">${scopeBadges}</div>
                </div>
             </td>
             <td class="px-4 py-3 text-right">
                <div class="inline-flex items-center gap-1">
                  <button onclick="handleEditTax('${taxId}')" class="w-8 h-8 inline-flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100" title="Edit">
                    <span class="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button onclick="handleDeleteTax('${taxId}')" class="w-8 h-8 inline-flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-100" title="Delete">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
             </td>
           `;
          taxTableBody.appendChild(row);
        });
      }
    } catch (e) {
      console.error('Error loading taxes:', e);
    }
  }

  window.resetTaxForm = function() {
    if (!taxForm) return;
    taxForm.reset();
    document.getElementById('tax-id').value = '';
    document.getElementById('tax-enabled').checked = true;
    document.querySelectorAll('input[name="tax-scope"]').forEach(cb => cb.checked = true);
    document.getElementById('tax-cancel-btn')?.classList.add('hidden');
    const submitText = document.getElementById('tax-submit-text');
    if (submitText) submitText.textContent = 'Save Tax';
  };

  window.handleEditTax = function(taxId) {
    const tax = currentLoadedTaxes.find(t => (t.id || t._id) === taxId);
    if (!tax) return;

    document.getElementById('tax-id').value = taxId;
    document.getElementById('tax-name').value = tax.name || '';
    document.getElementById('tax-percentage').value = tax.percentage !== undefined ? tax.percentage : '';
    document.getElementById('tax-enabled').checked = tax.enabled !== false;

    let types = [];
    if (Array.isArray(tax.orderTypes)) types = tax.orderTypes;
    else if (typeof tax.orderTypes === 'string') {
      try { types = JSON.parse(tax.orderTypes); } catch(e) { types = []; }
    }
    document.querySelectorAll('input[name="tax-scope"]').forEach(cb => {
      cb.checked = types.includes(cb.value);
    });

    document.getElementById('tax-cancel-btn')?.classList.remove('hidden');
    const submitText = document.getElementById('tax-submit-text');
    if (submitText) submitText.textContent = 'Update Tax';

    taxForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (taxForm) {
    taxForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const taxId = document.getElementById('tax-id').value;
      const name = document.getElementById('tax-name').value.trim();
      const percentage = parseFloat(document.getElementById('tax-percentage').value);
      const enabled = document.getElementById('tax-enabled').checked;

      // Gather Order Types
      const orderTypes = Array.from(document.querySelectorAll('input[name="tax-scope"]:checked')).map(cb => cb.value);

      if (!name || isNaN(percentage)) return alert('Invalid inputs');

      try {
        if (taxId) {
          await window.apiFetch(`/taxes/${taxId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, percentage, enabled, orderTypes })
          });
          showToast('✅ Tax updated!');
        } else {
          await window.apiFetch('/taxes', {
            method: 'POST',
            body: JSON.stringify({ name, percentage, enabled, orderTypes })
          });
          showToast('✅ Tax saved!');
        }
        resetTaxForm();
        loadTaxes();
      } catch (e) {
        alert('Error saving tax: ' + e.message);
      }
    });
  }

  window.handleDeleteTax = async function (id) {
    if (!confirm('Delete this tax?')) return;
    try {
      await window.apiFetch(`/taxes/${id}`, { method: 'DELETE' });
      showToast('🗑️ Tax deleted');
      loadTaxes();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // === Kitchen Printers Mappings ===
  window.addPrinterMappingRow = function(category = '', printer = '') {
    const container = document.getElementById('printer-mappings-list');
    if (!container) return;

    const products = window.EnhancedSecurity?.getSecureData('products') || [];
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

    const row = document.createElement('div');
    row.className = "flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 printer-mapping-row";

    let optionsHtml = `<option value="">-- Select Category --</option>`;
    categories.forEach(cat => {
      optionsHtml += `<option value="${cat}" ${cat === category ? 'selected' : ''}>${cat}</option>`;
    });

    row.innerHTML = `
      <div class="flex-1">
        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Product Category</label>
        <select class="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm font-medium outline-none mapping-category">
          ${optionsHtml}
        </select>
      </div>
      <div class="flex-1">
        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Printer Designation</label>
        <input type="text" value="${printer}" placeholder="e.g. Hot Kitchen, Bar" class="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm outline-none mapping-printer" />
      </div>
      <button type="button" onclick="this.closest('.printer-mapping-row').remove()" class="mt-4 p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center">
        <span class="material-symbols-outlined text-sm">delete</span>
      </button>
    `;
    container.appendChild(row);
  };

  window.loadPrinterMappings = function() {
    const container = document.getElementById('printer-mappings-list');
    if (!container) return;
    container.innerHTML = '';

    const settings = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const printers = settings.printers || {};

    Object.entries(printers).forEach(([category, printer]) => {
      window.addPrinterMappingRow(category, printer);
    });

    if (Object.keys(printers).length === 0) {
      window.addPrinterMappingRow();
    }
  };

  window.savePrinterMappings = function() {
    const rows = document.querySelectorAll('.printer-mapping-row');
    const printers = {};

    rows.forEach(row => {
      const categorySelect = row.querySelector('.mapping-category');
      const printerInput = row.querySelector('.mapping-printer');
      if (categorySelect && printerInput) {
        const category = categorySelect.value;
        const printer = printerInput.value.trim();
        if (category && printer) {
          printers[category] = printer;
        }
      }
    });

    const existing = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const updated = {
      ...existing,
      printers: printers
    };

    if (window.EnhancedSecurity?.storeSecureData) {
      window.EnhancedSecurity.storeSecureData('shop_settings', updated);
    }

    showToast('✅ Printer mappings saved successfully!');
  };

  // === Shift History ===
  window.loadShiftHistory = async function() {
    const tableBody = document.getElementById('shift-history-table-body');
    if (!tableBody) return;

    try {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-8 text-center text-slate-400">Loading shift history...</td>
        </tr>
      `;

      const shifts = await window.apiFetch('/shifts/history');
      if (!shifts || shifts.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="8" class="px-4 py-8 text-center text-slate-400">No shifts found in history.</td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = '';
      shifts.forEach(shift => {
        const openedDate = new Date(shift.openedAt).toLocaleString();
        const closedDate = shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase">Active</span>';
        
        const opening = parseFloat(shift.openingCash || 0).toFixed(2);
        const expected = parseFloat(shift.expectedCash || 0).toFixed(2);
        const actual = shift.closedAt ? parseFloat(shift.closingCash || 0).toFixed(2) : '-';
        
        let diffHtml = '-';
        if (shift.closedAt) {
          const diff = parseFloat(shift.difference || 0);
          if (diff === 0) {
            diffHtml = `<span class="text-green-600 font-semibold">0.00</span>`;
          } else if (diff > 0) {
            diffHtml = `<span class="text-green-600 font-semibold">+${diff.toFixed(2)}</span>`;
          } else {
            diffHtml = `<span class="text-red-600 font-semibold">${diff.toFixed(2)}</span>`;
          }
        }

        const cashierName = shift.cashier?.fullName || shift.cashier?.username || 'Unknown';
        const notes = shift.notes || '';

        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition-colors";
        row.innerHTML = `
          <td class="px-4 py-3 font-semibold text-slate-800">${cashierName}</td>
          <td class="px-4 py-3 whitespace-nowrap">${openedDate}</td>
          <td class="px-4 py-3 whitespace-nowrap">${closedDate}</td>
          <td class="px-4 py-3 text-right font-mono">${opening}</td>
          <td class="px-4 py-3 text-right font-mono">${expected}</td>
          <td class="px-4 py-3 text-right font-mono">${actual}</td>
          <td class="px-4 py-3 text-right font-mono">${diffHtml}</td>
          <td class="px-4 py-3 max-w-[200px] truncate" title="${notes}">${notes}</td>
        `;
        tableBody.appendChild(row);
      });
    } catch (e) {
      console.error('Failed to load shift history:', e);
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-8 text-center text-rose-500 font-semibold">Failed to load shifts: ${e.message}</td>
        </tr>
      `;
    }
  };

  // Initial Load
  if (window.apiFetch) {
    loadTaxes();
    loadShiftHistory();
  }
  loadPrinterMappings();

});
