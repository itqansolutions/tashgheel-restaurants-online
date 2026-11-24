const finite = (value, label) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${label}`);
    return n;
};
function parseArray(value) {
    if (value == null || value === '') return [];
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) throw new Error('Catalog data must be an array');
    return parsed;
}
async function readCatalog(client, tenantId) {
    const primary = await client.data.findUnique({ where: { key_tenantId: { key: 'spare_parts', tenantId } } });
    let products = parseArray(primary?.value);
    if (!products.length) {
        const legacy = await client.data.findUnique({ where: { key_tenantId: { key: 'products', tenantId } } });
        products = parseArray(legacy?.value);
    }
    return products;
}
function snapshotItems(items, products) {
    if (!Array.isArray(items) || !items.length) throw new Error('Items are required');
    return items.map(item => {
        const productId = String(item.productId ?? item.id ?? '');
        const product = products.find(p => String(p.id) === productId);
        if (!product) throw new Error('Product not found in current catalog');
        const size = product.hasSizes ? (product.sizes || []).find(s => String(s.id) === String(item.sizeId) || (item.sizeName && s.name === item.sizeName)) : null;
        if (product.hasSizes && !size) throw new Error('Product size is required');
        let cost = finite(size ? size.cost ?? 0 : product.cost ?? 0, 'product cost');
        for (const addon of item.addons || []) {
            const master = products.find(p => String(p.id) === String(addon.id));
            if (!master) throw new Error('Add-on not found in current catalog');
            const quantity = finite(addon.qty ?? 1, 'add-on quantity');
            if (quantity <= 0) throw new Error('Add-on quantity must be positive');
            cost += finite(master.cost ?? 0, 'add-on cost') * quantity;
        }
        if (finite(item.qty, 'quantity') <= 0) throw new Error('Quantity must be positive');
        return { ...item, id: productId, cost };
    });
}
module.exports = { parseArray, readCatalog, snapshotItems, finite };
