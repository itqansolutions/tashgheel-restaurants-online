// Pure validation of recorded movements. Never infer historical cost from today's menu.
function returnOptions(sale, movements) {
    if (!Array.isArray(movements)) { const e = new Error('Historical sale lacks verified stock movements; manual review required'); e.status = 409; throw e; }
    const products = new Map();
    for (const move of movements) {
        if (move.kind !== 'product') continue;
        if (move.branchId !== sale.branchId || typeof move.id !== 'string' || !Number.isFinite(move.qty) || move.qty <= 0) throw new Error('Invalid original stock movement');
        const option = products.get(move.id) || { productId: move.id, name: sale.items.find(item => item.productId === move.id)?.name || move.id, qty: 0, unitCost: move.unitCost, costVerified: Number.isFinite(move.unitCost) && move.unitCost >= 0 };
        option.qty += move.qty;
        if (!Number.isFinite(move.unitCost) || move.unitCost < 0 || option.unitCost !== move.unitCost) option.costVerified = false;
        products.set(move.id, option);
    }
    return [...products.values()];
}
function planReturn(sale, movements, restockItems) {
    const options = returnOptions(sale, movements);
    if (!Array.isArray(restockItems)) { const e = new Error('Choose returned intact goods explicitly, or an empty list for no restocking'); e.status = 400; throw e; }
    const seen = new Set(); let recoveredCost = 0;
    const restocks = restockItems.map(item => {
        const original = options.find(option => option.productId === item.productId);
        if (!original || seen.has(item.productId) || !Number.isFinite(item.qty) || item.qty <= 0 || item.qty > original.qty || item.intact !== true) { const e = new Error('Invalid intact-goods selection or quantity'); e.status = 400; throw e; }
        if (!original.costVerified) { const e = new Error('This older product movement lacks an exact cost snapshot; intact-goods return needs manual review'); e.status = 409; throw e; }
        seen.add(item.productId);
        recoveredCost += original.unitCost * item.qty;
        return { productId: item.productId, qty: item.qty, unitCost: original.unitCost };
    });
    const totalCost = sale.items.reduce((sum, item) => sum + item.cost * item.qty, 0);
    if (recoveredCost > totalCost + 0.000001) throw new Error('Recorded return cost exceeds original receipt cost');
    return { restocks, retainedCost: Math.max(0, totalCost - recoveredCost), recoveredCost };
}
module.exports = { returnOptions, planReturn };
