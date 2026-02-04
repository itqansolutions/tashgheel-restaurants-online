/**
 * Car Service Center - Data Access Layer
 * Wraps EnhancedSecurity to provide structured access to entities.
 */

window.DB = window.DB || {
    // === USERS (Auth) ===
    getUsers: function () {
        // 1. Try Global Cache (Auth.js)
        if (window.DataCache && window.DataCache.users && window.DataCache.users.length > 0) {
            return window.DataCache.users;
        }
        // 2. Try Secure Data
        const secure = window.EnhancedSecurity.getSecureData('users');
        if (secure && secure.length > 0) return secure;

        // 3. Try LocalStorage Fallback
        try {
            const local = JSON.parse(localStorage.getItem('users') || '[]');
            if (local.length > 0) return local;
        } catch (e) { }

        return [];
    },

    // === CUSTOMERS ===
    getCustomers: function () {
        return window.EnhancedSecurity.getSecureData('customers') || [];
    },

    saveCustomer: function (customer) {
        const customers = this.getCustomers();
        const index = customers.findIndex(c => c.id == customer.id);

        if (index >= 0) {
            customers[index] = { ...customers[index], ...customer, updatedAt: new Date().toISOString() };
        } else {
            // New customer
            customer.id = customer.id || Date.now();
            customer.createdAt = new Date().toISOString();
            customers.push(customer);
        }

        return window.EnhancedSecurity.storeSecureData('customers', customers);
    },

    deleteCustomer: function (id) {
        const customers = this.getCustomers();
        const filtered = customers.filter(c => c.id !== id);
        return window.EnhancedSecurity.storeSecureData('customers', filtered);
    },

    // === EMPLOYEES ===
    getEmployees: function () {
        return window.EnhancedSecurity.getSecureData('employees') || [];
    },

    saveEmployee: function (employee) {
        const employees = this.getEmployees();
        const index = employees.findIndex(e => e.id == employee.id);

        if (index >= 0) {
            employees[index] = { ...employees[index], ...employee, updatedAt: new Date().toISOString() };
        } else {
            employee.id = employee.id || Date.now();
            employee.createdAt = new Date().toISOString();
            employees.push(employee);
        }

        return window.EnhancedSecurity.storeSecureData('employees', employees);
    },

    deleteEmployee: function (id) {
        const employees = this.getEmployees();
        const filtered = employees.filter(e => e.id !== id);
        return window.EnhancedSecurity.storeSecureData('employees', filtered);
    },

    // === VEHICLES ===
    getVehicles: function (customerId = null) {
        const vehicles = window.EnhancedSecurity.getSecureData('vehicles') || [];
        if (customerId) {
            return vehicles.filter(v => v.customerId === customerId);
        }
        return vehicles;
    },

    saveVehicle: function (vehicle) {
        const vehicles = this.getVehicles();
        const index = vehicles.findIndex(v => v.id == vehicle.id);

        if (index >= 0) {
            vehicles[index] = { ...vehicles[index], ...vehicle, updatedAt: new Date().toISOString() };
        } else {
            vehicle.id = vehicle.id || Date.now(); // Using timestamp as ID for simplicity
            vehicle.createdAt = new Date().toISOString();
            vehicles.push(vehicle);
        }

        return window.EnhancedSecurity.storeSecureData('vehicles', vehicles);
    },

    deleteVehicle: function (id) {
        const vehicles = this.getVehicles();
        const filtered = vehicles.filter(v => v.id !== id);
        return window.EnhancedSecurity.storeSecureData('vehicles', filtered);
    },

    // === INGREDIENTS (Raw Materials) ===
    getIngredients: function () {
        return window.EnhancedSecurity.getSecureData('ingredients') || [];
    },

    saveIngredient: function (ingredient) {
        const ingredients = this.getIngredients();
        const index = ingredients.findIndex(i => i.id == ingredient.id);

        if (index >= 0) {
            ingredients[index] = { ...ingredients[index], ...ingredient, updatedAt: new Date().toISOString() };
        } else {
            ingredient.id = ingredient.id || Date.now();
            ingredient.createdAt = new Date().toISOString();
            ingredients.push(ingredient);
        }

        return window.EnhancedSecurity.storeSecureData('ingredients', ingredients);
    },

    deleteIngredient: function (id) {
        const ingredients = this.getIngredients();
        const filtered = ingredients.filter(i => i.id !== id);
        return window.EnhancedSecurity.storeSecureData('ingredients', filtered);
    },

    getIngredient: function (id) {
        const ingredients = this.getIngredients();
        return ingredients.find(i => i.id == id);
    },

    // === SPARE PARTS (Legacy / Inventory) ===
    getParts: function () {
        // Reuse existing 'products' key if preferred, or use new 'spare_parts'
        // Plan said 'spare_parts', but let's migrate default products to it if empty?
        // For now, let's use 'spare_parts' to keep it clean.
        return window.EnhancedSecurity.getSecureData('spare_parts') || [];
    },

    getPart: function (id) {
        const parts = this.getParts();
        return parts.find(p => p.id == id);
    },

    savePart: function (part) {
        const parts = this.getParts();
        const index = parts.findIndex(p => p.id == part.id);

        if (index >= 0) {
            parts[index] = { ...parts[index], ...part, updatedAt: new Date().toISOString() };
        } else {
            // Generate simple ID if not present (try to be sequential if possible, or timestamp)
            part.id = part.id || (parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1);
            part.createdAt = new Date().toISOString();
            parts.push(part);
        }

        return window.EnhancedSecurity.storeSecureData('spare_parts', parts);
    },

    deletePart: function (id) {
        const parts = this.getParts();
        const filtered = parts.filter(p => p.id !== id);
        return window.EnhancedSecurity.storeSecureData('spare_parts', filtered);
    },

    updateStock: function (partId, qtyChange) {
        const parts = this.getParts();
        const index = parts.findIndex(p => p.id == partId);
        if (index >= 0) {
            parts[index].stock = (parseInt(parts[index].stock) || 0) + parseInt(qtyChange);
            return window.EnhancedSecurity.storeSecureData('spare_parts', parts);
        }
        return false;
    },

    // === VISITS (Service Jobs) ===
    getVisits: function () {
        return window.EnhancedSecurity.getSecureData('visits') || [];
    },

    saveVisit: function (visit) {
        const visits = this.getVisits();
        const index = visits.findIndex(v => v.id == visit.id);

        if (index >= 0) {
            visits[index] = { ...visits[index], ...visit, updatedAt: new Date().toISOString() };
        } else {
            // Generate Invoice ID Format: 00001
            if (!visit.id) {
                const maxId = visits.reduce((max, v) => {
                    const num = parseInt(v.id) || 0;
                    return num > max ? num : max;
                }, 0);
                visit.id = String(maxId + 1).padStart(5, '0');
            }
            visit.createdAt = new Date().toISOString();
            visits.push(visit);
        }

        return window.EnhancedSecurity.storeSecureData('visits', visits);
    },

    getVisit: function (id) {
        const visits = this.getVisits();
        return visits.find(v => v.id === id);
    },

    // === VENDORS ===
    getVendors: function () {
        return window.EnhancedSecurity.getSecureData('vendors') || [];
    },

    saveVendor: function (vendor) {
        const vendors = this.getVendors();
        const index = vendors.findIndex(v => v.id == vendor.id);

        if (index >= 0) {
            vendors[index] = { ...vendors[index], ...vendor, updatedAt: new Date().toISOString() };
        } else {
            vendor.id = vendor.id || Date.now();
            vendor.credit = vendor.credit || 0; // Outstanding balance
            vendor.createdAt = new Date().toISOString();
            vendors.push(vendor);
        }

        return window.EnhancedSecurity.storeSecureData('vendors', vendors);
    },

    deleteVendor: function (id) {
        const vendors = this.getVendors();
        const filtered = vendors.filter(v => v.id !== id);
        return window.EnhancedSecurity.storeSecureData('vendors', filtered);
    },

    // Update vendor credit (add to debt when purchasing parts)
    updateVendorCredit: function (vendorId, amount) {
        const vendors = this.getVendors();
        const index = vendors.findIndex(v => v.id == vendorId);
        if (index >= 0) {
            vendors[index].credit = (parseFloat(vendors[index].credit) || 0) + parseFloat(amount);
            vendors[index].updatedAt = new Date().toISOString();
            return window.EnhancedSecurity.storeSecureData('vendors', vendors);
        }
        return false;
    },

    // === VENDOR TRANSACTIONS (Purchases & Payments) ===
    getVendorTransactions: function (vendorId) {
        const trans = window.EnhancedSecurity.getSecureData('vendor_transactions') || [];
        if (vendorId) {
            return trans.filter(t => t.vendorId == vendorId);
        }
        return trans;
    },

    addVendorTransaction: function (transaction) {
        // transaction: { vendorId, type: 'purchase'|'payment', amount, date, description, method: 'cash'|'credit' }
        const trans = this.getVendorTransactions();
        transaction.id = transaction.id || Date.now();
        transaction.createdAt = new Date().toISOString();
        trans.push(transaction);

        // Update vendor credit (running balance)
        if (transaction.type === 'purchase') {
            this.updateVendorCredit(transaction.vendorId, transaction.amount);
        } else if (transaction.type === 'payment') {
            this.updateVendorCredit(transaction.vendorId, -transaction.amount);
        }

        return window.EnhancedSecurity.storeSecureData('vendor_transactions', trans);
    },

    // Record vendor payment (Legacy Wrapper)
    recordVendorPayment: function (vendorId, amount, notes) {
        return this.addVendorTransaction({
            vendorId: vendorId,
            type: 'payment',
            amount: parseFloat(amount),
            description: notes || 'Manual Payment',
            date: new Date().toISOString().split('T')[0],
            method: 'cash'
        });
    },

    getVendorPayments: function (vendorId = null) {
        const payments = window.EnhancedSecurity.getSecureData('vendor_payments') || [];
        if (vendorId) {
            return payments.filter(p => p.vendorId == vendorId);
        }
        return payments;
    },

    // Get single vendor by ID
    getVendor: function (vendorId) {
        const vendors = this.getVendors();
        return vendors.find(v => v.id == vendorId);
    },

    // === SALESMEN ===
    getSalesmen: function () {
        return window.EnhancedSecurity.getSecureData('salesmen') || [];
    },

    saveSalesman: function (salesman) {
        const salesmen = this.getSalesmen();
        const index = salesmen.findIndex(s => s.id == salesman.id);
        if (index >= 0) {
            salesmen[index] = { ...salesmen[index], ...salesman, updatedAt: new Date().toISOString() };
        } else {
            salesman.id = salesman.id || Date.now();
            salesman.createdAt = new Date().toISOString();
            salesmen.push(salesman);
        }
        return window.EnhancedSecurity.storeSecureData('salesmen', salesmen);
    },

    deleteSalesman: function (id) {
        const salesmen = this.getSalesmen();
        const filtered = salesmen.filter(s => s.id !== id);
        return window.EnhancedSecurity.storeSecureData('salesmen', filtered);
    },

    // === SALES (Receipts) ===
    getSales: function () {
        return window.EnhancedSecurity.getSecureData('sales') || [];
    },

    saveSale: function (sale) {
        const sales = this.getSales();
        // Sales are usually append-only, but let's allow update if needed
        const index = sales.findIndex(s => s.id == sale.id);

        if (index >= 0) {
            sales[index] = { ...sales[index], ...sale, updatedAt: new Date().toISOString() };
        } else {
            // New Sale
            if (!sale.id) sale.id = 'REC-' + Date.now();
            sale.createdAt = new Date().toISOString();
            sales.push(sale);
        }
        return window.EnhancedSecurity.storeSecureData('sales', sales);
    },

    // === MAINTENANCE REMINDERS ===
    getMaintenanceReminders: function () {
        const visits = this.getVisits().filter(v => v.status === 'Completed');
        const vehicles = this.getVehicles();
        const customers = this.getCustomers();
        const reminders = [];

        // Group visits by vehicle
        const vehicleVisits = {};
        visits.forEach(v => {
            if (!vehicleVisits[v.vehicleId]) vehicleVisits[v.vehicleId] = [];
            vehicleVisits[v.vehicleId].push(v);
        });

        // Check each vehicle for upcoming maintenance
        vehicles.forEach(vehicle => {
            const vVisits = vehicleVisits[vehicle.id] || [];
            if (vVisits.length === 0) return;

            // Sort by date desc
            vVisits.sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
            const lastVisit = vVisits[0];
            const lastDate = new Date(lastVisit.completedAt || lastVisit.createdAt);
            const daysSince = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

            // Simple rule: Remind if > 90 days since last service
            if (daysSince > 90) {
                const customer = customers.find(c => c.id === vehicle.customerId);
                reminders.push({
                    vehicleId: vehicle.id,
                    customerId: vehicle.customerId,
                    customerName: customer?.name || 'Unknown',
                    mobile: customer?.mobile || '',
                    vehicle: `${vehicle.brand} ${vehicle.model} (${vehicle.plateNumber})`,
                    lastServiceDate: lastDate.toISOString().split('T')[0],
                    daysSince: daysSince,
                    message: `${daysSince} days since last service`
                });
            }
        });

        return reminders;
    },

    // === TABLES (Dine In) ===
    getTables: function () {
        let tables = window.EnhancedSecurity.getSecureData('tables');
        if (!tables || tables.length === 0) {
            // Seed default tables
            tables = [];
            for (let i = 1; i <= 20; i++) {
                tables.push({ id: i, name: `Table ${i}` });
            }
            window.EnhancedSecurity.storeSecureData('tables', tables);
        }
        return tables;
    },

    saveTable: function (table) {
        const tables = this.getTables();
        const index = tables.findIndex(t => t.id == table.id);
        if (index >= 0) {
            tables[index] = table;
        } else {
            table.id = table.id || Date.now();
            tables.push(table);
        }
        return window.EnhancedSecurity.storeSecureData('tables', tables);
    },

    deleteTable: function (id) {
        const tables = this.getTables();
        const filtered = tables.filter(t => t.id !== id);
        return window.EnhancedSecurity.storeSecureData('tables', filtered);
    },

    // === DELIVERY AREAS ===
    getDeliveryAreas: function () {
        return window.EnhancedSecurity.getSecureData('delivery_areas') || [];
    },

    saveDeliveryArea: function (area) {
        const areas = this.getDeliveryAreas();
        const index = areas.findIndex(a => a.id == area.id);

        if (index >= 0) {
            areas[index] = { ...areas[index], ...area, updatedAt: new Date().toISOString() };
        } else {
            area.id = area.id || Date.now();
            area.createdAt = new Date().toISOString();
            areas.push(area);
        }
        return window.EnhancedSecurity.storeSecureData('delivery_areas', areas);
    },

    deleteDeliveryArea: function (id) {
        const areas = this.getDeliveryAreas();
        const filtered = areas.filter(a => a.id !== id);
        return window.EnhancedSecurity.storeSecureData('delivery_areas', filtered);
    }
};

// Expose globally
window.DB = DB;
