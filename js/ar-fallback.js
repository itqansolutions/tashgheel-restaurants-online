/**
 * Arabic fallback translator.
 * When the UI language is Arabic, any visible English text that has an exact entry here
 * (labels, headings, buttons, placeholders, table headers, dialog text) is replaced.
 * It also covers text rendered later by page scripts (modals, kitchen cards, tables).
 */
(function () {
    if (localStorage.getItem('pos_language') !== 'ar') return;
    const D = {
        // Products / Add Product modal
        'Add Product': 'إضافة صنف', 'Edit Product': 'تعديل الصنف', 'Basic Info': 'البيانات الأساسية', 'Inventory': 'المخزون',
        'Pricing & Sizes': 'الأسعار والأحجام', 'Recipe Ingredients': 'مكونات الوصفة', 'Add-ons': 'الإضافات',
        'Basic Information': 'البيانات الأساسية', 'Inventory & Cost': 'المخزون والتكلفة', 'Recipe & Ingredient Costing': 'الوصفة وتكلفة المكونات',
        'Item Type': 'نوع الصنف', 'Service': 'خدمة', 'Simple Product': 'صنف بسيط', 'Recipe Product': 'صنف بوصفة',
        'Code / Barcode': 'الكود / الباركود', 'Category': 'القسم', 'Image URL': 'رابط الصورة', 'Stock Qty (Direct Sales)': 'كمية المخزون (بيع مباشر)',
        'Direct Cost': 'التكلفة المباشرة', 'Has Multiple Sizes / Variants?': 'له أحجام / أنواع متعددة؟', 'Standard Price': 'السعر العادي',
        'Dine-In Price (Opt)': 'سعر الصالة (اختياري)', 'Delivery Price (Opt)': 'سعر التوصيل (اختياري)', 'Size Name': 'اسم الحجم',
        'Code': 'الكود', 'Price': 'السعر', 'Dine-In': 'الصالة', 'Delivery': 'توصيل', 'Cost': 'التكلفة', 'Recipe': 'الوصفة', 'Actions': 'إجراءات',
        'Add': 'إضافة', 'Raw Material': 'خامة', 'Qty': 'الكمية', 'Unit': 'الوحدة', 'Waste %': 'الهالك %', 'Material': 'الخامة', 'Waste': 'الهالك',
        'Action': 'إجراء', 'Allow All Add-ons (No restriction)': 'السماح بكل الإضافات (بدون قيود)', 'Select Specific Add-ons:': 'اختر إضافات محددة:',
        'Save Menu Item': 'حفظ الصنف', 'Ingredient': 'المكوّن', 'Type': 'النوع', 'Fix': 'ثابت', 'Wst': 'هالك', 'Close': 'إغلاق', 'Save Recipe': 'حفظ الوصفة',
        'Manage your restaurant offerings, prices, and recipes.': 'إدارة أصناف المطعم وأسعارها ووصفاتها.', 'Export Menu': 'تصدير القائمة',
        'New...': 'جديد...', 'e.g. Cheese Burger': 'مثال: تشيز برجر', 'Scan or type code': 'امسح أو اكتب الكود', 'New Category': 'قسم جديد',
        'Same': 'نفس السعر', 'Name': 'الاسم', 'Multiple Sizes': 'أحجام متعددة', 'No menu items found.': 'لا توجد أصناف.',
        '-- Select Ingredient --': '-- اختر المكوّن --', '-- Select --': '-- اختر --', 'Select Size:': 'اختر الحجم:',
        '-- Select Add-on --': '-- اختر إضافة --', 'Please select a size above': 'اختر حجمًا من الأعلى',
        // Shift dialogs (POS)
        'Open New Shift': 'فتح وردية جديدة', 'Please enter the starting cash in drawer.': 'من فضلك أدخل النقدية الموجودة في الدرج.',
        'Opening Cash (EGP)': 'النقدية الافتتاحية (ج.م)', 'Open Shift': 'فتح الوردية', 'Close Shift': 'إغلاق الوردية',
        'Opening:': 'الافتتاح:', 'Sales (Cash):': 'مبيعات (نقدي):', 'Expected:': 'المتوقع:', 'Physical Cash (EGP)': 'النقدية الفعلية (ج.م)',
        'Cancel': 'إلغاء', 'Save': 'حفظ', 'Shift notes...': 'ملاحظات الوردية...', 'Done': 'تم', 'Confirm': 'تأكيد',
        // Pay vendor / vendors
        'Pay Vendor': 'سداد للمورد', 'Vendor': 'المورد', 'Current Balance': 'الرصيد الحالي', 'Payment Amount *': 'مبلغ الدفع *', 'Payment Amount': 'مبلغ الدفع',
        'Notes / Ref #': 'ملاحظات / رقم مرجع', 'Process Payment': 'تنفيذ الدفع', 'Vendors': 'الموردين', 'Manage your raw material suppliers and payments.': 'إدارة موردي الخامات والمدفوعات.',
        'Summary': 'ملخص', 'Report': 'كشف حساب', 'Edit': 'تعديل', 'Delete': 'حذف', 'Print': 'طباعة', 'Loading...': 'جار التحميل...',
        // Inventory / raw materials
        'Raw Materials & Stock': 'الخامات والمخزون', 'Inventory List': 'قائمة المخزون', 'All Branches': 'كل الفروع', 'Cost/Unit': 'تكلفة الوحدة',
        'Stock': 'المخزون', 'Total Value': 'القيمة الإجمالية', 'Add Material': 'إضافة خامة', 'Edit Material': 'تعديل الخامة',
        'Kilogram (kg)': 'كيلوجرام (كجم)', 'Gram (g)': 'جرام (جم)', 'Liter (l)': 'لتر', 'Milliliter (ml)': 'مللي لتر', 'Piece (pcs)': 'قطعة',
        '-- Select Vendor --': '-- اختر المورد --', 'Min Stock Limit': 'الحد الأدنى للمخزون', 'Expiration (Optional)': 'تاريخ الصلاحية (اختياري)',
        'Reset': 'إعادة ضبط', 'Recorded': 'المسجل', 'Actual': 'الفعلي', 'Diff': 'الفرق', 'Save Changes': 'حفظ التغييرات',
        'Adjustment Type': 'نوع التعديل', 'Waste (Thrown away)': 'هالك (تم التخلص منه)', 'Damage (Broken/Spoiled)': 'تالف (مكسور/فاسد)', 'Expired': 'منتهي الصلاحية',
        'Audit Correction': 'تصحيح جرد', 'Transfer IN (+)': 'تحويل وارد (+)', 'Transfer OUT (-)': 'تحويل صادر (-)', 'Quantity': 'الكمية', 'Reason': 'السبب',
        'Target Branch': 'الفرع المستلم', 'Loading branches...': 'جار تحميل الفروع...', 'Transfer': 'تحويل', 'Restock Material': 'إعادة تعبئة خامة',
        'Current Stock': 'المخزون الحالي', 'Avg Unit Cost': 'متوسط تكلفة الوحدة', 'Vendor / Supplier': 'المورد', 'Add Qty': 'الكمية المضافة', 'Unit Cost': 'تكلفة الوحدة',
        'Total Purchase Cost': 'إجمالي تكلفة الشراء', 'Purchase Type': 'نوع الشراء', 'Credit (Pay Later)': 'آجل (دفع لاحقًا)', 'Adds to vendor debt': 'يضاف إلى مديونية المورد',
        'Paid Now': 'مدفوع الآن', 'Vendor balance stays 0': 'رصيد المورد لا يتغير', 'Payment Method': 'طريقة الدفع', 'Notes (Optional)': 'ملاحظات (اختياري)',
        'Search materials...': 'ابحث في الخامات...', 'e.g. Tomato': 'مثال: طماطم', 'e.g. Invoice #1234': 'مثال: فاتورة رقم 1234',
        'Expiring Soon': 'تنتهي قريبًا', 'Healthy Stock': 'مخزون سليم', 'No materials found.': 'لا توجد خامات.', 'Healthy': 'سليم', 'Slow': 'بطيء', 'Dead': 'راكد',
        'Low Stock': 'مخزون منخفض', 'Age unknown': 'العمر غير معروف', 'Restock': 'إعادة تعبئة', 'Adjust/Waste': 'تعديل/هالك', '-- Select Target Branch --': '-- اختر الفرع --',
        // Receipts
        'Recent Transactions': 'آخر العمليات', 'Auto-refreshing': 'تحديث تلقائي',
        // Kitchen
        'Kitchen': 'المطبخ', 'Waiting for orders...': 'في انتظار الطلبات...', 'Loading delivery orders...': 'جار تحميل طلبات التوصيل...',
        'No active dine-in items': 'لا توجد أصناف نشطة بالصالة', 'All orders completed!': 'جميع الطلبات مكتملة!', 'Waiting for new orders...': 'في انتظار طلبات جديدة...',
        'Dine In': 'صالة', 'Take Away': 'تيك أواي', 'Takeaway': 'تيك أواي', 'Table:': 'الطاولة:', 'PREPARING': 'جار التحضير', 'Complete': 'تم', 'KITCHEN TICKET': 'تذكرة المطبخ',

        'Product Name': 'اسم الصنف', 'Product Name *': 'اسم الصنف *', 'Total Cost:': 'إجمالي التكلفة:', 'Calculated automatically': 'يُحسب تلقائيًا', 'Recipe & Costing:': 'الوصفة والتكلفة:', 'Total:': 'الإجمالي:',
        'For pre-packaged items (e.g. bottled water). Direct stock tracking, manual cost.': 'للأصناف المعبأة (مثل زجاجة مياه). تتبع مخزون مباشر وتكلفة يدوية.',
        'Manager Authorization': 'تصريح المدير', 'Enter manager PIN to continue': 'أدخل رقم المدير السري للمتابعة', '✅ Connected & Synced': '✅ متصل ومتزامن', 'Synchronizing Data...': 'جار مزامنة البيانات...',
        'Stock Audit': 'جرد المخزون', 'Adjust / Waste Stock': 'تعديل / هالك المخزون', 'For Waste/Damage, enter positive number (system will subtract).': 'للهالك/التالف أدخل رقمًا موجبًا (سيخصمه النظام).',
        'Transfer Stock': 'تحويل مخزون', 'Available Stock:': 'المخزون المتاح:', 'Cash': 'نقدي', 'Card': 'بطاقة', 'Mobile': 'محفظة', 'Confirm Restock': 'تأكيد إعادة التعبئة', 'Why is this matching happening?': 'ما سبب هذا الفرق؟',
        'No address provided': 'لا يوجد عنوان', 'Kitchen Orders': 'طلبات المطبخ', 'Delivery Orders': 'طلبات التوصيل', 'No delivery orders': 'لا توجد طلبات توصيل', 'Waiting for orders from delivery apps...': 'في انتظار طلبات تطبيقات التوصيل...',
        'Receipts': 'الفواتير', 'Search by cashier or ID...': 'ابحث بالكاشير أو الرقم...', 'Reason...': 'السبب...', 'Reason (required)': 'السبب (مطلوب)',
        'Access Denied': 'غير مسموح', 'Viewing Mode': 'وضع المشاهدة', 'Low': 'منخفض', 'Expand': 'توسيع', '+ New Address': '+ عنوان جديد', '+ New Customer': '+ عميل جديد', 'Talabat Cash': 'طلبات نقدي', 'Talabat Visa': 'طلبات فيزا',
        'Toggle taxes for this specific order.': 'تفعيل/إيقاف الضرائب لهذا الطلب فقط.', 'None': 'بدون', 'Percentage (%)': 'نسبة (%)', 'Fixed Value': 'قيمة ثابتة', 'Split Payment': 'تقسيم الدفع', 'Split the check between Cash and Card amounts': 'قسّم الفاتورة بين النقدي والبطاقة',
        'Total to Pay': 'الإجمالي المطلوب', 'Cash Portion (EGP)': 'الجزء النقدي (ج.م)', 'Card Portion (EGP)': 'الجزء بالبطاقة (ج.م)', 'Remaining:': 'المتبقي:', 'Add Note': 'إضافة ملاحظة', 'Quick Tags:': 'وسوم سريعة:',
        'VIP': 'مميز', 'Spicy': 'حار', 'No Onion': 'بدون بصل', 'Extra': 'إضافي', 'No Sugar': 'بدون سكر', 'Well Done': 'مستوي جيدًا', 'Change Size': 'تغيير الحجم', 'Global Invoice Discount': 'خصم على الفاتورة',
        'Apply discount to the entire bill': 'تطبيق الخصم على الفاتورة كاملة', 'Discount Type': 'نوع الخصم', 'No Discount': 'بدون خصم', 'Fixed Amount (EGP)': 'مبلغ ثابت (ج.م)', 'Discount Value': 'قيمة الخصم', 'Extras:': 'الإضافات:',
        'Special Instructions / Note:': 'تعليمات خاصة / ملاحظة:', 'Add to Cart': 'أضف للسلة', 'New Customer': 'عميل جديد', 'Add Address': 'إضافة عنوان', 'Pending Orders': 'طلبات معلقة', 'Test Sound': 'تجربة الصوت',
        'No pending online orders.': 'لا توجد طلبات أونلاين معلقة.', 'Open Tables': 'الطاولات المفتوحة', 'Select a table to view and close the bill': 'اختر طاولة لعرض الفاتورة وإغلاقها', 'Order Items': 'أصناف الطلب',
        'Percent %': 'نسبة %', 'Fixed Amount': 'مبلغ ثابت', 'Some items are still being prepared.': 'بعض الأصناف ما زالت قيد التحضير.', 'Close Bill': 'إغلاق الفاتورة', 'Force Close': 'إغلاق إجباري',
        'Force Close requires manager confirmation and overrides item readiness checks.': 'الإغلاق الإجباري يحتاج تأكيد المدير ويتجاوز فحص جاهزية الأصناف.',
        'Choose how you want to handle this order session': 'اختر طريقة التعامل مع هذا الطلب', 'Tables overview, live table cart, & orders': 'نظرة على الطاولات والطلبات المفتوحة', 'Customer address, delivery zones & rider assignment': 'عنوان العميل ومناطق التوصيل وتعيين المندوب',
        'Direct counter sales & fast pickup orders': 'بيع مباشر من الكاونتر واستلام سريع', 'Phone/Name...': 'الهاتف/الاسم...', 'Order Note (Kitchen)...': 'ملاحظة الطلب (للمطبخ)...', 'Value': 'القيمة', 'e.g. No onions, Extra spicy...': 'مثال: بدون بصل، حار زيادة...',
        'Street': 'الشارع', 'Bldg': 'مبنى', 'Floor': 'الدور', 'Apt': 'شقة', 'Landmark': 'علامة مميزة', 'Area': 'المنطقة', 'Go to Activation': 'اذهب للتفعيل', 'This system requires a valid license to operate.': 'يتطلب النظام ترخيصًا ساريًا للعمل.',
        // POS misc
        'Tables': 'الطاولات', 'Online Orders': 'الطلبات الأونلاين', 'Manage Taxes': 'إدارة الضرائب', 'Total Amount': 'الإجمالي', 'Split': 'تقسيم',
        'Preview': 'معاينة', 'Subtotal': 'المجموع الفرعي', 'Select Order Type': 'اختر نوع الطلب'
    };
    // Case-insensitive lookup (headers are often uppercased in source)
    const L = {};
    Object.keys(D).forEach(k => { L[k.toLowerCase()] = D[k]; });
    const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/;
    function tr(raw) {
        if (!raw) return null;
        const s = raw.replace(/\s+/g, ' ').trim();
        if (!s || /[\u0600-\u06FF]/.test(s)) return null;
        if (L[s.toLowerCase()]) return L[s.toLowerCase()];
        const tb = s.match(/^Table (\d+)$/i); if (tb) return 'طاولة ' + tb[1];
        const m = s.match(/^([^A-Za-z0-9\u0600-\u06FF]*(?:\d+\.\s+)?)(.*?)([\s:*]*)$/);
        if (!m) return null;
        if (/^[a-z_0-9]+$/.test(m[2])) return null;
        const hit = L[m[2].toLowerCase()] || (m[3].indexOf(':') >= 0 ? L[(m[2] + ':').toLowerCase()] : null);
        if (!hit) return null;
        return m[1].replace(/^\d+\.\s+$/, '') + hit + (L[m[2].toLowerCase()] ? m[3] : m[3].replace(':', ''));
    }
    function walk(root) {
        if (!root) return;
        if (root.nodeType === 3) {
            const p = root.parentElement;
            if (p && (SKIP.test(p.tagName) || /material-/.test(p.getAttribute('class') || ''))) return;
            const r = tr(root.nodeValue);
            if (r) root.nodeValue = r;
            return;
        }
        if (root.nodeType !== 1) return;
        if (SKIP.test(root.tagName)) { if (root.hasAttribute('placeholder')) { const r = tr(root.getAttribute('placeholder')); if (r) root.setAttribute('placeholder', r); } return; }
        if (/material-/.test(root.getAttribute('class') || '')) return;
        ['placeholder', 'title'].forEach(a => {
            if (root.hasAttribute && root.hasAttribute(a)) { const r = tr(root.getAttribute(a)); if (r) root.setAttribute(a, r); }
        });
        if (root.tagName === 'OPTION' || root.tagName === 'INPUT' && /^(button|submit)$/.test(root.type)) {
            if (root.tagName === 'INPUT') { const r = tr(root.value); if (r) root.value = r; }
        }
        root.childNodes.forEach(walk);
    }
    let busy = false;
    function run(n) { if (busy) return; busy = true; try { walk(n || document.body); } finally { busy = false; } }
    function start() {
        run(document.body);
        new MutationObserver(muts => {
            if (busy) return;
            busy = true;
            try { muts.forEach(m => { m.addedNodes.forEach(walk); if (m.type === 'characterData' || m.type === 'attributes') walk(m.target); }); } finally { busy = false; }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
