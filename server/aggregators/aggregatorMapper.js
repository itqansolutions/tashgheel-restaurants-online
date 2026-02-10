/**
 * Aggregator Mapper
 * 
 * Maps AggregatorOrder → Sale (provider-agnostic).
 * Also maps products → provider catalog format.
 */

const { AGGREGATOR_STATUSES } = require('../models/AggregatorOrder');

/**
 * Map an AggregatorOrder to a Sale document
 * @param {object} aggOrder - AggregatorOrder document
 * @param {object} branch - Branch document
 * @param {string} nextInvoiceId - Next invoice number (e.g. REC-456)
 * @returns {object} Sale-compatible data
 */
function mapToSale(aggOrder, branch, nextInvoiceId) {
    // Map items to Sale item format
    const saleItems = (aggOrder.items || []).map(item => ({
        id: item.providerItemId || '',
        name: item.name,
        qty: item.qty,
        price: item.price,
        cost: 0,  // Will be enriched with actual cost from ProductStock
        discount: { type: 'none', value: 0 }
    }));

    return {
        id: nextInvoiceId,
        tenantId: aggOrder.tenantId,
        branchId: aggOrder.branchId,
        cashier: 'Aggregator',
        salesman: aggOrder.provider,

        total: aggOrder.financials?.total || 0,
        subtotal: aggOrder.financials?.total - (aggOrder.financials?.vat || 0),
        discount: 0,
        deliveryFee: aggOrder.financials?.fees?.delivery || 0,
        tax: aggOrder.financials?.vat || 0,

        status: 'finished',
        method: aggOrder.paymentMethod === 'cod' ? 'cash' : 'online',
        orderType: 'delivery',

        // Aggregator-specific fields
        source: aggOrder.provider,
        aggregatorOrderId: aggOrder._id.toString(),

        items: saleItems,
        date: aggOrder.createdAt || new Date()
    };
}

/**
 * Enrich sale items with actual cost from product data
 * @param {Array} saleItems - Items from mapToSale
 * @param {Array} products - Product list with costs
 * @returns {Array} Items with cost snapshots
 */
function enrichItemCosts(saleItems, products) {
    const productMap = {};
    products.forEach(p => {
        productMap[String(p.id)] = p;
    });

    return saleItems.map(item => {
        const product = productMap[item.id];
        if (product && product.cost) {
            item.cost = parseFloat(product.cost);
        }
        return item;
    });
}

/**
 * Map products to a generic catalog format
 * Each adapter's syncMenu() can further transform this
 * @param {Array} products - Your product list
 * @returns {Array} Generic catalog items
 */
function mapToCatalog(products) {
    return (products || []).map(p => ({
        id: String(p.id),
        name: p.name || '',
        description: p.description || '',
        price: parseFloat(p.price || 0),
        category: p.category || 'General',
        available: p.available !== false,
        image: p.image || ''
    }));
}

module.exports = {
    mapToSale,
    enrichItemCosts,
    mapToCatalog
};
