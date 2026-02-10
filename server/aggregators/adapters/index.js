/**
 * Provider Registry
 * 
 * Central registry for all delivery aggregator adapters.
 * Each adapter implements the same interface (see talabat.js for reference).
 */

const talabat = require('./talabat');
const ubereats = require('./ubereats');
const careem = require('./careem');
const mrsool = require('./mrsool');

const providers = {
    talabat,
    uber_eats: ubereats,
    careem_now: careem,
    mrsool
};

/**
 * Get adapter by provider key
 * @param {string} providerKey - e.g. 'talabat', 'uber_eats'
 * @returns {object|null}
 */
function getAdapter(providerKey) {
    return providers[providerKey] || null;
}

/**
 * List all registered provider keys
 */
function listProviders() {
    return Object.keys(providers);
}

/**
 * List only providers that support a specific capability
 * @param {string} capability - e.g. 'webhook', 'syncMenu', 'pushStatus'
 */
function listWithCapability(capability) {
    return Object.entries(providers)
        .filter(([, adapter]) => adapter.capabilities[capability])
        .map(([key]) => key);
}

module.exports = {
    providers,
    getAdapter,
    listProviders,
    listWithCapability
};
