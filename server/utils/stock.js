const crypto=require('crypto');
const {readCatalog}=require('./catalog');
async function deductIngredientsStock(tenantId, branchId, items, txClient) {
    try {
        const products = await readCatalog(txClient, tenantId);

        const ingData = await txClient.data.findUnique({
            where: { key_tenantId: { key: 'ingredients', tenantId } }
        });
        if (!ingData) {
            if (items.some(item => { const p = products.find(p => String(p.id) === String(item.productId ?? item.id)); return (p?.recipe || []).length || (p?.sizes || []).some(size => (size.recipe || []).length); })) throw new Error('Recipe ingredients are missing');
            return [];
        }

        let ingredients = typeof ingData.value === 'string' ? JSON.parse(ingData.value) : ingData.value;
        if (!Array.isArray(ingredients)) return;

        let changed = false;
        const movements = [];

        for (const item of items) {
            const product = products.find(p => String(p.id) === String(item.productId ?? item.id));
            if (!product) continue;

            let recipeToUse = [];
            if ((item.sizeId || item.sizeName) && product.hasSizes && product.sizes) {
                const size = product.sizes.find(s => s.id == item.sizeId || s.name === item.sizeName);
                recipeToUse = size ? (size.recipe || []) : [];
            } else {
                recipeToUse = product.recipe || [];
            }

            if (recipeToUse && recipeToUse.length > 0) {
                recipeToUse.forEach(ingItem => {
                    const idx = ingredients.findIndex(i => String(i.id) === String(ingItem.ingredientId));
                    if (idx !== -1) {
                        const factor = parseFloat(ingItem.conversionFactor || 1);
                        let consumeQty = 0;
                        const qtyToDeduct = parseFloat(item.qty || 0);

                        if (ingItem.wasteType === 'fixed') {
                            consumeQty = (parseFloat(ingItem.qty || 0) + parseFloat(ingItem.wasteValue || 0)) * qtyToDeduct * factor;
                        } else {
                            const w = parseFloat(ingItem.wasteValue || ingItem.wastePercent || 0);
                            if (w < 100) {
                                const yieldPct = (100 - w) / 100;
                                const grossUsageQty = parseFloat(ingItem.qty || 0) / yieldPct;
                                consumeQty = grossUsageQty * qtyToDeduct * factor;
                            } else {
                                consumeQty = parseFloat(ingItem.qty || 0) * qtyToDeduct * factor;
                            }
                        }

                        // 🌿 Branch-aware stock: use stockByBranch[branchId] when available
                        if (!ingredients[idx].stockByBranch) ingredients[idx].stockByBranch = {};
                        const branchKey = branchId || 'default';
                        const currentBranchStock = parseFloat(
                            ingredients[idx].stockByBranch[branchKey] ?? ingredients[idx].stock ?? 0
                        );
                        if (!Number.isFinite(consumeQty) || consumeQty < 0) throw new Error('Invalid ingredient quantity');
                        movements.push({ kind: 'ingredient', id: String(ingredients[idx].id), branchId: branchKey, qty: consumeQty });
                        ingredients[idx].stockByBranch[branchKey] = currentBranchStock - consumeQty;
                        // Keep flat stock in sync for backward compatibility
                        ingredients[idx].stock = Object.values(ingredients[idx].stockByBranch)
                            .reduce((sum, v) => sum + parseFloat(v || 0), 0);
                        ingredients[idx].lastUsedAt = new Date().toISOString();
                        ingredients[idx].updatedAt = new Date().toISOString();
                        ingredients[idx].stockRevision = crypto.randomUUID();
                        changed = true;
                    } else throw new Error('Recipe ingredient not found');
                });
            }
        }

        if (changed) {
            await txClient.data.update({
                where: { key_tenantId: { key: 'ingredients', tenantId } },
                data: { value: JSON.stringify(ingredients), updatedAt: new Date() }
            });
        }
        return movements;
    } catch (err) {
        throw err;
    }
}

async function applyStock(tx,tenantId,branchId,items) {
            // Each component is deducted once, regardless of parent type.
            const catalog = await readCatalog(tx, tenantId);
            const movements = [];
            const components = items.flatMap(item => [item, ...(item.addons || []).map(addon => ({ id: addon.id, qty: item.qty * (addon.qty || 1) }))]);
            for (const item of components) {
                const product = catalog.find(p => String(p.id) === String(item.id));
                const type = product.itemType || product.type || ((product.recipe || []).length ? 'recipe' : 'simple');
                if (type !== 'simple') continue;
                const changed = await tx.productStock.updateMany({
                    where: { tenantId: tenantId, branchId: branchId, productId: String(item.id), qty: { gte: item.qty } },
                    data: { qty: { decrement: item.qty } }
                });
                if (changed.count !== 1) { const error = new Error('Insufficient stock for ' + product.name); error.status = 409; throw error; }
                const size = product.hasSizes ? (product.sizes || []).find(size => String(size.id) === String(item.sizeId) || (item.sizeName && size.name === item.sizeName)) : null;
                const unitCost = Number(size ? size.cost ?? 0 : product.cost ?? 0);
                if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Invalid stock movement cost');
                movements.push({ kind: 'product', id: String(item.id), branchId: branchId, qty: item.qty, unitCost });
            }
            movements.push(...await deductIngredientsStock(tenantId, branchId, components, tx));

 return movements;
}
module.exports={applyStock};
