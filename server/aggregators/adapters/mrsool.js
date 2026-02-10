/**
 * Mrsool Adapter — Stub
 * 
 * Implements the standard adapter interface.
 * All methods throw 'Not yet implemented' until API credentials and docs are available.
 */

const NOT_IMPLEMENTED = 'Mrsool adapter not yet implemented';

const capabilities = {
    webhook: false,
    pushStatus: false,
    syncMenu: false,
    codSupported: false,
    polling: false
};

const displayInfo = {
    name: 'Mrsool',
    color: '#7B2D8E',       // Mrsool purple
    badgeClass: 'mrsool',
    icon: '🟣'
};

function verifySignature() { throw new Error(NOT_IMPLEMENTED); }
function parseOrder() { throw new Error(NOT_IMPLEMENTED); }
function mapStatus() { throw new Error(NOT_IMPLEMENTED); }
async function pushStatus() { throw new Error(NOT_IMPLEMENTED); }
async function syncMenu() { throw new Error(NOT_IMPLEMENTED); }
async function testConnection() { return false; }
function getSignatureHeader() { return 'x-mrsool-signature'; }

module.exports = {
    capabilities,
    displayInfo,
    verifySignature,
    parseOrder,
    mapStatus,
    pushStatus,
    syncMenu,
    testConnection,
    getSignatureHeader
};
