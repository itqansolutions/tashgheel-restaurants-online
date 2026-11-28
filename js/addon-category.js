// Is this product category an add-ons category?
//
// Restaurants name it in their own language ("Add-ons", "Extras", "الإضافات"),
// so detection must not depend on the English word. Matching is done on a
// normalized string: Arabic alef/ya/ta-marbuta variants folded, diacritics and
// separators removed, so "إضافات", "الإضافات" and "اضافات" all match.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.isAddonCategory = api.isAddonCategory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const ADDON_TOKENS = ['addon', 'addons', 'addonitem', 'extra', 'extras', 'اضافات', 'اضافه', 'ملحقات'];

    function normalizeCategoryName(name) {
        return String(name || '')
            .toLowerCase()
            .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // Arabic diacritics + tatweel
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/[\s\-_/.()،,:]+/g, '');
    }

    function isAddonCategory(name) {
        const normalized = normalizeCategoryName(name);
        if (!normalized) return false;
        return ADDON_TOKENS.some(token => normalized.includes(token));
    }

    return { isAddonCategory, normalizeCategoryName };
});
