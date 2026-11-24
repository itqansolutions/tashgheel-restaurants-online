const crypto=require('crypto');
const {readCatalog}=require('./catalog');
const {recipeLines}=require('./recipes');
async function deductIngredientsStock(tenantId,branchId,items,txClient) {
    const products=await readCatalog(txClient,tenantId);
    const doc=await txClient.data.findUnique({where:{key_tenantId:{key:'ingredients',tenantId}}});
    const ingredients=doc?(typeof doc.value==='string'?JSON.parse(doc.value):doc.value):[];
    if(!Array.isArray(ingredients))throw new Error('Invalid ingredients data');
    const required=new Map();
    for(const item of items) {
        const product=products.find(product=>String(product.id)===String(item.productId??item.id));
        if(!product)throw new Error('Product not found');
        for(const line of recipeLines(product,item,ingredients)) {
            const id=String(line.ingredient.id);const current=required.get(id)||{ingredient:line.ingredient,qty:0};current.qty+=line.qty;required.set(id,current);
        }
    }
    const movements=[];
    for(const {ingredient,qty} of required.values()) {
        const branchStock=ingredient.stockByBranch?.[branchId];
        if(branchStock===undefined||branchStock===null||!Number.isFinite(Number(branchStock))) {const error=new Error('Ingredient branch balance is unknown: '+ingredient.name);error.status=409;throw error;}
        const current=Number(branchStock);if(current+1e-9<qty){const error=new Error('Insufficient ingredient stock: '+ingredient.name);error.status=409;throw error;}
        ingredient.stockByBranch[branchId]=Math.max(0,current-qty);
        ingredient.stock=Object.values(ingredient.stockByBranch).reduce((sum,value)=>sum+Number(value||0),0);
        ingredient.lastUsedAt=new Date().toISOString();ingredient.updatedAt=new Date().toISOString();ingredient.stockRevision=crypto.randomUUID();
        movements.push({kind:'ingredient',id:String(ingredient.id),branchId,qty});
    }
    if(required.size)await txClient.data.update({where:{key_tenantId:{key:'ingredients',tenantId}},data:{value:JSON.stringify(ingredients),updatedAt:new Date()}});
    return movements;
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
