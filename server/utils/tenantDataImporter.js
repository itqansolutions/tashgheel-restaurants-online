const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const storage = require('./storage');

const TARGET_TENANT_ID = 'c4b0f05e-7e27-4f26-8140-fab09204c764';
const IMPORT_MARKER_KEY = 'import_marker_itqan_demo_v2';

const ENCRYPTION_KEY = 'AliKaram@2025!POS#Security$Enhanced&';
function decryptDesktopPassword(encryptedText) {
    if (!encryptedText) return null;
    try {
        const text = decodeURIComponent(escape(Buffer.from(encryptedText, 'base64').toString('binary')));
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length));
        }
        return result;
    } catch (e) {
        return null;
    }
}

/**
 * Imports customer backup data for the target tenant
 * @param {string} tenantId 
 * @param {object} customData Optional backup object; if not provided, reads from server/data/itqan_demo_customer_backup.json
 * @param {boolean} force Force re-import even if marker exists
 */
async function importCustomerData(tenantId = TARGET_TENANT_ID, customData = null, force = false) {
    console.log(`[TenantDataImporter] Starting import for tenant ${tenantId}...`);

    // 1. Load backup data
    let backup = customData;
    if (!backup) {
        const seedsPath = path.join(__dirname, '../seeds/itqan_demo_customer_backup.json');
        const dataPath = path.join(__dirname, '../data/itqan_demo_customer_backup.json');
        const backupPath = fs.existsSync(seedsPath) ? seedsPath : dataPath;
        if (!fs.existsSync(backupPath)) {
            console.warn(`[TenantDataImporter] Backup file not found at ${seedsPath} or ${dataPath}`);
            return { success: false, error: 'Backup file not found' };
        }
        try {
            backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        } catch (e) {
            console.error('[TenantDataImporter] Failed to parse backup file:', e.message);
            return { success: false, error: 'Failed to parse backup JSON: ' + e.message };
        }
    }

    // 2. Check if already imported
    if (!force) {
        try {
            const existingMarker = await prisma.data.findUnique({
                where: { key_tenantId: { key: IMPORT_MARKER_KEY, tenantId } }
            });
            if (existingMarker) {
                console.log(`[TenantDataImporter] Tenant ${tenantId} already imported. Skipping.`);
                return { success: true, message: 'Already imported', skipped: true };
            }
        } catch (mErr) {
            console.warn('[TenantDataImporter] Error checking marker:', mErr.message);
        }
    }

    // 3. Ensure Tenant exists
    let tenant;
    try {
        tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { branches: true }
        });
    } catch (e) {
        console.warn('[TenantDataImporter] Tenant find error:', e.message);
    }

    const shopSettings = backup.pos_secure_shop_settings || {};
    const tenantSettings = {
        shopName: backup.shopName || shopSettings.shopName || 'Hamza',
        shopAddress: backup.shopAddress || shopSettings.shopAddress || 'Sharabya',
        footerMessage: backup.footerMessage || shopSettings.footerMessage || 'Hamza Hamoza',
        shopLogo: backup.shopLogo || shopSettings.shopLogo || '',
        actionPassword: shopSettings.actionPassword || '1234',
        receiptPrinter: shopSettings.receiptPrinter || 'Microsoft Print to PDF',
        language: backup.pos_language || 'ar',
        taxRate: 0,
        taxName: 'VAT'
    };

    const tenYearsFromNow = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                id: tenantId,
                businessName: 'itqan demo',
                email: 'itqan-demo@itqansolutions.com',
                phone: '011026522373',
                trialEndsAt: tenYearsFromNow,
                subscriptionEndsAt: tenYearsFromNow,
                isSubscribed: true,
                subscriptionStartedAt: new Date(),
                status: 'active',
                subscriptionPlan: 'enterprise',
                settings: tenantSettings
            },
            include: { branches: true }
        });
        console.log(`[TenantDataImporter] Created tenant ${tenantId}`);
    } else {
        tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: {
                businessName: tenant.businessName || 'itqan demo',
                status: 'active',
                isSubscribed: true,
                subscriptionEndsAt: tenYearsFromNow,
                settings: { ...(tenant.settings || {}), ...tenantSettings }
            },
            include: { branches: true }
        });
        console.log(`[TenantDataImporter] Updated tenant ${tenantId}`);
    }

    // 4. Ensure Default Branch exists
    let mainBranch = tenant.branches && tenant.branches.length > 0 ? tenant.branches[0] : null;
    if (!mainBranch) {
        mainBranch = await prisma.branch.create({
            data: {
                tenantId: tenantId,
                name: 'Main Branch',
                code: 'MAIN',
                isActive: true,
                settings: { currency: 'EGP', language: 'ar' }
            }
        });
        console.log(`[TenantDataImporter] Created main branch ${mainBranch.id}`);
    }

    // 5. Save all Key-Value collections in Data table
    const spareParts = backup.pos_secure_spare_parts || [];
    const ingredients = backup.pos_secure_ingredients || [];
    const customers = backup.pos_secure_customers || [];
    const vendors = backup.pos_secure_vendors || [];
    const vendorPayments = backup.pos_secure_vendor_payments || [];
    const vendorTransactions = backup.pos_secure_vendor_transactions || [];
    const tables = backup.pos_secure_tables || [];
    const salesmen = backup.pos_secure_salesmen || [];
    const deliveryAreas = backup.pos_secure_delivery_areas || [];
    let categories = backup.pos_secure_categories || [];
    if (!categories.length && spareParts.length) {
        categories = Array.from(new Set(spareParts.map(p => p.category).filter(Boolean)));
    }
    const sales = backup.pos_secure_sales || [];
    const users = backup.pos_secure_users || [];
    const license = backup.pos_secure_license || {};

    const dataMappings = [
        { key: 'spare_parts', value: spareParts },
        { key: 'products', value: spareParts },
        { key: 'ingredients', value: ingredients },
        { key: 'customers', value: customers },
        { key: 'vendors', value: vendors },
        { key: 'vendor_payments', value: vendorPayments },
        { key: 'vendor_transactions', value: vendorTransactions },
        { key: 'tables', value: tables },
        { key: 'salesmen', value: salesmen },
        { key: 'delivery_areas', value: deliveryAreas },
        { key: 'categories', value: categories },
        { key: 'sales', value: sales },
        { key: 'users', value: users },
        { key: 'license', value: license },
        { key: 'shop_settings', value: tenantSettings },
        { key: 'shopName', value: tenantSettings.shopName },
        { key: 'shopAddress', value: tenantSettings.shopAddress },
        { key: 'footerMessage', value: tenantSettings.footerMessage },
        { key: 'shopLogo', value: tenantSettings.shopLogo },
        { key: 'pos_language', value: tenantSettings.language },
        { key: 'returns', value: backup.pos_secure_returns || [] },
        { key: 'expenses', value: backup.pos_secure_expenses || [] }
    ];

    // Vendor specific transaction key
    if (vendors.length > 0) {
        for (const v of vendors) {
            const vId = v.id || v._id;
            const vTxs = vendorTransactions.filter(t => String(t.vendorId) === String(vId));
            dataMappings.push({
                key: `vendor_transactions_${vId}`,
                value: vTxs.length > 0 ? vTxs : vendorTransactions
            });
        }
    }

    for (const item of dataMappings) {
        try {
            await storage.saveData(item.key, item.value, tenantId);
        } catch (kvErr) {
            console.warn(`[TenantDataImporter] Failed to save key ${item.key}:`, kvErr.message);
        }
    }
    console.log(`[TenantDataImporter] Saved ${dataMappings.length} data keys to storage.`);

    // 6. Upsert Relational Users
    try {
        const defaultAdminHash = await bcrypt.hash('admin123', 10);

        // Ensure default admin exists
        await prisma.user.upsert({
            where: { tenantId_username: { tenantId, username: 'admin' } },
            update: {
                fullName: 'System Administrator',
                role: 'admin',
                active: true,
                defaultBranchId: mainBranch.id,
                branches: { connect: [{ id: mainBranch.id }] }
            },
            create: {
                tenantId,
                username: 'admin',
                passwordHash: defaultAdminHash,
                fullName: 'System Administrator',
                role: 'admin',
                active: true,
                defaultBranchId: mainBranch.id,
                branches: { connect: [{ id: mainBranch.id }] }
            }
        });

        // Loop through active users in backup
        const activeUsers = users.filter(u => u.active !== false && (u.username || '').trim());
        for (const u of activeUsers) {
            const username = u.username.trim().toLowerCase();
            const plainPass = decryptDesktopPassword(u.passwordHash) || (username === 'admin' ? 'admin123' : '123456');
            const hash = await bcrypt.hash(plainPass, 10);
            const userRole = (u.role === 'admin' || u.role === 'manager' || u.role === 'asstant manager') ? 'admin' : (u.role || 'cashier');

            await prisma.user.upsert({
                where: { tenantId_username: { tenantId, username } },
                update: {
                    fullName: u.fullName || username,
                    role: userRole,
                    active: true,
                    allowedPages: u.allowedPages || null,
                    defaultBranchId: mainBranch.id,
                    branches: { connect: [{ id: mainBranch.id }] }
                },
                create: {
                    tenantId,
                    username,
                    passwordHash: hash,
                    fullName: u.fullName || username,
                    role: userRole,
                    allowedPages: u.allowedPages || null,
                    active: true,
                    defaultBranchId: mainBranch.id,
                    branches: { connect: [{ id: mainBranch.id }] }
                }
            });
            console.log(`[TenantDataImporter] Synced user ${username} (${userRole})`);
        }
    } catch (uErr) {
        console.warn('[TenantDataImporter] User sync error:', uErr.message);
    }

    // 7. Upsert Relational Customers
    for (const c of customers) {
        if (!c.mobile && !c.name) continue;
        try {
            const mobile = c.mobile || `cust-${c.id || Date.now()}`;
            await prisma.customer.upsert({
                where: { tenantId_mobile: { tenantId, mobile } },
                update: {
                    name: c.name || 'عميل',
                    notes: c.notes || null,
                    addresses: c.addresses || null,
                    branchId: mainBranch.id
                },
                create: {
                    tenantId,
                    mobile,
                    name: c.name || 'عميل',
                    notes: c.notes || null,
                    addresses: c.addresses || null,
                    branchId: mainBranch.id
                }
            });
        } catch (cErr) {
            console.warn('[TenantDataImporter] Customer sync error:', cErr.message);
        }
    }

    // 8. Upsert Relational Vendors
    for (const v of vendors) {
        if (!v.name) continue;
        try {
            await prisma.vendor.upsert({
                where: { tenantId_name: { tenantId, name: v.name } },
                update: {
                    mobile: v.mobile || null,
                    address: v.address || null,
                    credit: parseFloat(v.credit) || 0,
                    branchId: mainBranch.id
                },
                create: {
                    tenantId,
                    name: v.name,
                    mobile: v.mobile || null,
                    address: v.address || null,
                    credit: parseFloat(v.credit) || 0,
                    branchId: mainBranch.id
                }
            });
        } catch (vErr) {
            console.warn('[TenantDataImporter] Vendor sync error:', vErr.message);
        }
    }

    // 9. Upsert Relational Tables
    for (let idx = 0; idx < tables.length; idx++) {
        const tbl = tables[idx];
        const code = `T${idx + 1}`;
        try {
            await prisma.table.upsert({
                where: { tenantId_code: { tenantId, code } },
                update: {
                    name: tbl.name || `Table ${idx + 1}`,
                    capacity: parseInt(tbl.capacity) || 4,
                    branchId: mainBranch.id
                },
                create: {
                    tenantId,
                    code,
                    name: tbl.name || `Table ${idx + 1}`,
                    capacity: parseInt(tbl.capacity) || 4,
                    branchId: mainBranch.id
                }
            });
        } catch (tErr) {
            console.warn('[TenantDataImporter] Table sync error:', tErr.message);
        }
    }

    // 10. Upsert Delivery Zones
    for (const dz of deliveryAreas) {
        if (!dz.name) continue;
        try {
            await prisma.deliveryZone.upsert({
                where: {
                    tenantId_branchId_name: {
                        tenantId,
                        branchId: mainBranch.id,
                        name: dz.name
                    }
                },
                update: {
                    fee: parseFloat(dz.fee) || 0,
                    isActive: true
                },
                create: {
                    tenantId,
                    branchId: mainBranch.id,
                    name: dz.name,
                    fee: parseFloat(dz.fee) || 0,
                    isActive: true
                }
            });
        } catch (dzErr) {
            console.warn('[TenantDataImporter] Delivery zone sync error:', dzErr.message);
        }
    }

    // 11. Upsert Historical Sales & Sale Items
    console.log(`[TenantDataImporter] Processing ${sales.length} historical sales...`);
    let salesImported = 0;
    for (const sale of sales) {
        if (!sale.id) continue;
        try {
            const saleDate = sale.date ? new Date(sale.date) : (sale.createdAt ? new Date(sale.createdAt) : new Date());
            const existingSale = await prisma.sale.findUnique({ where: { id: String(sale.id) } });

            if (!existingSale) {
                await prisma.sale.create({
                    data: {
                        id: String(sale.id),
                        receiptNo: sale.orderNo ? String(sale.orderNo) : null,
                        tenantId,
                        branchId: mainBranch.id,
                        cashier: sale.cashier || 'admin',
                        salesman: sale.salesman || null,
                        total: parseFloat(sale.total) || 0,
                        subtotal: parseFloat(sale.subtotal) || parseFloat(sale.total) || 0,
                        discount: parseFloat(sale.discount) || 0,
                        deliveryFee: parseFloat(sale.deliveryFee) || 0,
                        status: sale.status || 'finished',
                        method: sale.method || 'cash',
                        orderType: sale.orderType || 'take_away',
                        tableId: sale.tableId ? String(sale.tableId) : null,
                        tableName: sale.tableName || null,
                        customer: sale.customer || null,
                        date: saleDate,
                        createdAt: sale.createdAt ? new Date(sale.createdAt) : saleDate,
                        items: {
                            create: (sale.items || []).map((it, itIdx) => ({
                                id: `${sale.id}-item-${itIdx}`,
                                productId: it.id ? String(it.id) : null,
                                productCode: it.code || null,
                                name: it.name || 'Item',
                                qty: parseFloat(it.qty) || 1,
                                price: parseFloat(it.price) || 0,
                                cost: parseFloat(it.cost) || 0,
                                note: it.note || null
                            }))
                        }
                    }
                });
                salesImported++;
            }
        } catch (sErr) {
            // Silently continue if sale already exists or item constraint
        }
    }
    console.log(`[TenantDataImporter] Imported ${salesImported} new historical sales`);

    // 12. Set completion marker
    try {
        await storage.saveData(IMPORT_MARKER_KEY, {
            importedAt: new Date().toISOString(),
            tenantId,
            salesCount: sales.length,
            productsCount: spareParts.length,
            ingredientsCount: ingredients.length,
            customersCount: customers.length,
            vendorsCount: vendors.length
        }, tenantId);
    } catch (markErr) {
        console.warn('[TenantDataImporter] Failed to save completion marker:', markErr.message);
    }

    console.log(`[TenantDataImporter] Import completed successfully for tenant ${tenantId}!`);
    return {
        success: true,
        tenantId,
        stats: {
            products: spareParts.length,
            ingredients: ingredients.length,
            customers: customers.length,
            vendors: vendors.length,
            sales: sales.length,
            tables: tables.length,
            deliveryAreas: deliveryAreas.length
        }
    };
}

/**
 * Auto-import entrypoint invoked on server startup
 */
async function autoImportCustomerData() {
    try {
        await importCustomerData(TARGET_TENANT_ID, null, false);
    } catch (err) {
        console.error('[TenantDataImporter:autoImportCustomerData] Error:', err);
    }
}

module.exports = {
    importCustomerData,
    autoImportCustomerData,
    TARGET_TENANT_ID
};
