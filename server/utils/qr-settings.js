// Guest (QR) ordering is on unless the owner turned it off in shop settings.
async function qrOrderingEnabled(client, tenantId) {
    const doc = await client.data.findUnique({ where: { key_tenantId: { key: 'shop_settings', tenantId } } });
    let settings = doc?.value;
    if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) { settings = {}; } }
    return !(settings && settings.qrOrderingEnabled === false);
}
module.exports = { qrOrderingEnabled };
