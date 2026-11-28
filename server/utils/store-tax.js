// Tax the public online store charges.
//
// The tenant's Taxes & VAT records are what the POS charges on every order, so
// they are the source of truth for the store too. A tenant that never created a
// tax record can still have set a rate on the branch form (Branch.settings),
// which stays as the fallback. The store must never invent its own rate: the
// cart panel and the checkout both read this one resolver.

const ORDER_TYPE_ALIASES = {
    takeaway: 'take_away',
    take_away: 'take_away',
    pickup: 'take_away',
    delivery: 'delivery',
    dine_in: 'dine_in',
    dinein: 'dine_in'
};

// Store order types are 'takeaway' and 'delivery'; POS/tax records use 'take_away'.
function normalizeOrderType(orderType) {
    const key = String(orderType || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ORDER_TYPE_ALIASES[key] || 'take_away';
}

function parseOrderTypes(value) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

function taxAppliesToOrderType(tax, orderType) {
    const types = parseOrderTypes(tax.orderTypes);
    if (types.length === 0) return false;
    return types.includes(orderType);
}

function taxAppliesToBranch(tax, branchId) {
    // A tax without a branch is global to the tenant.
    if (!tax.branchId) return true;
    return String(tax.branchId) === String(branchId);
}

function resolveFromTaxes(taxes, branchId, orderType) {
    const type = normalizeOrderType(orderType);
    const applicable = (taxes || []).filter(t => t && t.enabled !== false && taxAppliesToBranch(t, branchId) && taxAppliesToOrderType(t, type));
    if (applicable.length === 0) return null;
    const rate = applicable.reduce((sum, t) => sum + (Number(t.percentage) || 0), 0);
    const names = applicable.map(t => t.name).filter(Boolean);
    return {
        rate,
        name: names.length ? names.join(' + ') : 'VAT',
        source: 'taxes',
        taxes: applicable.map(t => ({ id: t.id, name: t.name, percentage: Number(t.percentage) || 0 }))
    };
}

function resolveFromBranchSettings(branch) {
    const settings = (branch && branch.settings) || {};
    const rate = Number(settings.taxRate) || 0;
    return { rate, name: settings.taxName || 'VAT', source: rate > 0 ? 'branch_settings' : 'none', taxes: [] };
}

// taxes: the tenant's enabled Tax rows (prisma.tax.findMany({ where: { tenantId, enabled: true } }))
function resolveStoreTax(taxes, branch, orderType) {
    return resolveFromTaxes(taxes, branch && branch.id, orderType) || resolveFromBranchSettings(branch);
}

// Both order types the store offers, so the store page can show one rate in the
// cart panel and the same rate at checkout whatever the customer picks.
function resolveStoreTaxForStore(taxes, branch) {
    return {
        takeaway: resolveStoreTax(taxes, branch, 'takeaway'),
        delivery: resolveStoreTax(taxes, branch, 'delivery')
    };
}

module.exports = { normalizeOrderType, resolveStoreTax, resolveStoreTaxForStore, parseOrderTypes };
