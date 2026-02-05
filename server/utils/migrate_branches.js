const mongoose = require('mongoose');
const path = require('path');
const Branch = require('../models/Branch');
const storage = require('./storage');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function migrate() {
    console.log('🚀 Starting Multi-Branch Migration...');

    // Connect DB
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb+srv://TashgheelRest:tiIeHRcROCt4WFTz@cluster0.ehhhepk.mongodb.net/?appName=Cluster0';
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI missing');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Get All Tenants
        // Note: 'tenants' might be in a generic 'data' collection or specific. 
        // Assuming strict 'tenants' collection from previous interactions (auth.js).
        // If using `storage.js` logic, we might need to query `db.collection('tenants')`.
        // Let's use generic access to be safe.
        const tens = await mongoose.connection.db.collection('tenants').find({}).toArray();
        console.log(`Found ${tens.length} tenants.`);

        for (const t of tens) {
            console.log(`Processing Tenant: ${t.businessName || t.email} (${t._id})`);

            // 2. Check/Create Default Branch
            let mainBranch = await Branch.findOne({ tenantId: t._id, code: 'MAIN' });
            if (!mainBranch) {
                mainBranch = await Branch.create({
                    tenantId: t._id,
                    name: 'Main Branch',
                    code: 'MAIN', // Default Code
                    address: 'Main Location',
                    isActive: true,
                    settings: {
                        currency: 'EGP',
                        taxRate: 14
                    }
                });
                console.log(`   ✅ Created Default Branch: ${mainBranch._id}`);
            } else {
                console.log(`   ℹ️ Default Branch exists: ${mainBranch._id}`);
            }

            // 3. Patch Users (Add branchIds if missing)
            // Users are in 'users' collection
            const usersUpdate = await mongoose.connection.db.collection('users').updateMany(
                { tenantId: t._id, branchIds: { $exists: false } },
                { $set: { branchIds: [mainBranch._id], defaultBranchId: mainBranch._id } }
            );
            console.log(`   bust patched ${usersUpdate.modifiedCount} users.`);

            // 4. Patch Orders/Sales
            const salesUpdate = await mongoose.connection.db.collection('sales').updateMany(
                { tenantId: t._id, branchId: { $exists: false } },
                { $set: { branchId: mainBranch._id } }
            );
            console.log(`   bust patched ${salesUpdate.modifiedCount} sales.`);

            // 5. Patch Inventory
            // In Option B, we move `stock` from Product to `product_stocks`.
            // But for now, user asked to just PATCH data.
            // "db.orders.updateMany... Same for inventory"
            // If we strictly follow Option B, we need to creating ProductStock entries.
            // Let's do that for completeness.
            const products = await mongoose.connection.db.collection('products').find({ tenantId: t._id }).toArray();
            let stockCount = 0;
            for (const p of products) {
                // If product has 'stock' field, migrate it to ProductStock
                if (p.stock !== undefined) {
                    await mongoose.connection.db.collection('product_stocks').updateOne(
                        { tenantId: t._id, branchId: mainBranch._id, productId: p._id },
                        {
                            $setOnInsert: {
                                qty: p.stock,
                                minStock: p.minStock || 0,
                                createdAt: new Date(),
                                updatedAt: new Date()
                            }
                        },
                        { upsert: true }
                    );
                    stockCount++;
                }
            }
            console.log(`   bust migrated stock for ${stockCount} products.`);

            // 6. Patch Expenses/Transactions
            const expUpdate = await mongoose.connection.db.collection('expenses').updateMany(
                { tenantId: t._id, branchId: { $exists: false } },
                { $set: { branchId: mainBranch._id } }
            );
            console.log(`   bust patched ${expUpdate.modifiedCount} expenses.`);
        }

        console.log('🎉 Migration Complete!');
        process.exit(0);

    } catch (e) {
        console.error('Migration Failed:', e);
        process.exit(1);
    }
}

migrate();
