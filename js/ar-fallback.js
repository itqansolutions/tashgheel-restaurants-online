/**
 * Arabic fallback translator.
 * When the UI language is Arabic, any visible English text that has an exact entry here
 * (labels, headings, buttons, placeholders, table headers, dialog text) is replaced.
 * It also covers text rendered later by page scripts (modals, kitchen cards, tables).
 */
(function () {
    const FORCE = document.documentElement.hasAttribute('data-force-ar');
    if (localStorage.getItem('pos_language') !== 'ar' && !FORCE) return;
    if (FORCE) {
        document.documentElement.lang = 'ar';
        document.documentElement.dir = 'rtl';
        const setBody = () => { if (document.body) { document.body.dir = 'rtl'; document.body.classList.add('rtl'); } };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setBody); else setBody();
    }
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
        'Preview': 'معاينة', 'Subtotal': 'المجموع الفرعي', 'Select Order Type': 'اختر نوع الطلب',
        // Reports page
        'Reports Analytics': 'تحليلات التقارير', 'Live Monitor': 'متابعة مباشرة', 'Sales': 'المبيعات',
        'Delivery': 'التوصيل', 'COGS': 'تكلفة البضاعة المباعة', 'Expenses': 'المصروفات', 'Stock Value': 'قيمة المخزون',
        'Branch': 'الفرع', 'Please Wait...': 'يرجى الانتظار...', 'Excel': 'إكسل', 'PDF': 'PDF', 'Print': 'طباعة',
        'Refresh Data': 'تحديث البيانات', 'Today': 'اليوم', 'Yesterday': 'أمس', 'This Week': 'هذا الأسبوع',
        'Week': 'الأسبوع', 'This Month': 'هذا الشهر', 'Last Month': 'الشهر الماضي', 'Month': 'الشهر',
        'From Date': 'من تاريخ', 'To Date': 'إلى تاريخ', 'Live Monitor:': 'متابعة مباشرة:',
        'Net Sales': 'صافي المبيعات', 'Real-time': 'مباشر', 'Orders': 'الطلبات', 'Receipts': 'الإيصالات',
        'Avg Ticket': 'متوسط الفاتورة', 'Per Order': 'لكل طلب', 'Gross Profit': 'إجمالي الربح',
        'Sales - COGS': 'المبيعات - تكلفة البضاعة', 'Discounts': 'الخصومات', 'Deductions': 'الاستقطاعات',
        'Returns': 'المرتجعات', 'Refunded': 'مسترد', 'Sales Per Hour': 'المبيعات حسب الساعة',
        'Payment Method': 'طريقة الدفع', 'Active Shift:': 'الوردية الحالية:', 'Drawer Expected:': 'المتوقع في الدرج:',
        'Recent Orders': 'الطلبات الأخيرة', 'Order ID': 'رقم الطلب', 'Amount': 'المبلغ', 'Method': 'طريقة الدفع',
        'Cashier': 'الكاشير', 'Status': 'الحالة', 'Time': 'الوقت', 'Gross Sales': 'إجمالي المبيعات',
        'Pre-Discount': 'قبل الخصم', 'Real Revenue': 'الإيراد الفعلي', 'Tax Collected': 'الضرائب المحصلة',
        'VAT / Taxes': 'ضريبة القيمة المضافة / الضرائب', 'Orders Count': 'عدد الطلبات', 'Completed': 'مكتمل',
        'Net / Orders': 'صافي المبيعات / الطلبات', 'Sales by Payment': 'المبيعات حسب طريقة الدفع',
        'Sales by Category': 'المبيعات حسب القسم', 'Category Performance': 'أداء الأقسام', 'Qty': 'الكمية',
        'Category': 'القسم', 'Net Sales': 'صافي المبيعات', 'Cashier Performance': 'أداء الكاشير',
        'Avg': 'المتوسط', 'Top Products': 'أعلى الأصناف مبيعًا', 'Product Name': 'اسم الصنف',
        'Qty Sold': 'الكمية المباعة', 'Total Delivery Revenue': 'إجمالي إيرادات التوصيل',
        'Sales + Fees': 'المبيعات + الرسوم', 'Delivery Fees': 'رسوم التوصيل', 'Fees Collected': 'الرسوم المحصلة',
        'Total Orders': 'إجمالي الطلبات', 'Completed Deliveries': 'عمليات التوصيل المكتملة',
        'Avg Delivery Fee': 'متوسط رسوم التوصيل', 'Daily Delivery Fees': 'رسوم التوصيل اليومية',
        'Orders by Source': 'الطلبات حسب المصدر', 'Delivery Man': 'مندوب التوصيل', 'Driver': 'السائق',
        'Fees Generated': 'الرسوم المحصلة', 'Total Sales': 'إجمالي المبيعات', 'Source Performance': 'أداء المصادر',
        'Source': 'المصدر', 'Revenue': 'الإيرادات', 'Total Expenses': 'إجمالي المصروفات',
        'Daily Average': 'المتوسط اليومي', 'Largest Expense': 'أكبر مصروف', 'Net Profit': 'صافي الربح',
        'Expenses by Category': 'المصروفات حسب القسم', 'Daily Expense Trend': 'اتجاه المصروفات اليومية',
        'Expense Details': 'تفاصيل المصروفات', 'Export to Excel': 'تصدير إلى إكسل', 'Date': 'التاريخ',
        'Description': 'الوصف', 'Total COGS': 'إجمالي تكلفة البضاعة المباعة', 'Cost of Goods': 'تكلفة البضاعة',
        'Net Sales - COGS': 'صافي المبيعات - تكلفة البضاعة', 'Profit Margin %': 'هامش الربح %',
        'Profit / Net Sales': 'الربح / صافي المبيعات', 'Avg Cost / Order': 'متوسط التكلفة / الطلب',
        'Efficiency Metric': 'مؤشر الكفاءة', 'Income Breakdown': 'تفصيل الإيرادات', 'Cost by Category': 'التكلفة حسب القسم',
        'Product Profitability': 'ربحية الأصناف', 'Product': 'الصنف', 'Sold': 'المباع', 'Profit': 'الربح',
        'Margin': 'هامش الربح', 'Category Profitability': 'ربحية الأقسام', 'Low Margin Alerts (< 20%)': 'تنبيهات هامش الربح المنخفض (أقل من 20%)',
        'Current Cost': 'التكلفة الحالية', 'Sales Price': 'سعر البيع', 'Margin %': 'هامش الربح %',
        'Suggested Price (30%)': 'السعر المقترح (30%)', 'Total Stock Cost': 'إجمالي تكلفة المخزون',
        'Retail Value': 'قيمة البيع بالتجزئة', 'Expected Profit': 'الربح المتوقع', 'Low Stock Items': 'أصناف منخفضة المخزون',
        'Stock by Category': 'المخزون حسب القسم', 'Top 10 High Value Assets': 'أعلى 10 أصناف من حيث القيمة',
        'Inventory Aging Analysis': 'تحليل أعمار المخزون', 'Healthy (0-7 Days)': 'جيد (0-7 أيام)',
        'Warning (8-30 Days)': 'تحذير (8-30 يومًا)', 'Slow (31-90 Days)': 'بطيء (31-90 يومًا)',
        'Dead Stock (90+ Days)': 'مخزون راكد (أكثر من 90 يومًا)', 'Unit Cost': 'تكلفة الوحدة',
        'Total Value': 'القيمة الإجمالية', 'Last Sold': 'آخر بيع', 'Days Idle': 'أيام الركود', 'Health': 'الحالة',
        'Sales (EGP)': 'المبيعات (ج.م)', 'Cash': 'نقدي', 'Card': 'بطاقة', 'Wallet': 'محفظة',
        'Other / Unclassified': 'أخرى / غير مصنفة', 'Net Sales': 'صافي المبيعات', 'Financial Overview': 'نظرة مالية عامة',
        'Daily Expenses': 'المصروفات اليومية',
        // ── Tables page (tables.html) ──
        'Tables Management': 'إدارة الطاولات', 'Create and manage dining tables for this branch': 'إنشاء وإدارة طاولات هذا الفرع',
        'Add Table': 'إضافة طاولة', 'Total Tables': 'إجمالي الطاولات', 'Available': 'متاحة', 'Occupied': 'مشغولة',
        'Total Seats': 'إجمالي المقاعد', 'Loading tables...': 'جار تحميل الطاولات...', 'Table Name': 'اسم الطاولة',
        'Short Code': 'الكود المختصر', '(used in QR URL)': '(يُستخدم في رابط QR)',
        'Alphanumeric, max 10 chars. Customers scan a QR that contains this code.': 'حروف وأرقام إنجليزية، 10 أحرف كحد أقصى. العميل يمسح QR يحتوي هذا الكود.',
        'Number of Seats': 'عدد المقاعد', 'Save Table': 'حفظ الطاولة', 'Edit Table': 'تعديل الطاولة',
        'Archive Table?': 'أرشفة الطاولة؟', 'The table will be hidden from the floor plan. Historical orders are preserved.': 'ستُخفى الطاولة من مخطط الصالة. الطلبات السابقة تظل محفوظة.',
        'Archive': 'أرشفة', 'e.g. Table 1 / VIP Room / Bar Seat 3': 'مثال: طاولة 1 / غرفة VIP / بار 3',
        'e.g. T1, VIP, BAR3': 'مثال: T1 أو VIP أو BAR3', 'Name and code are required.': 'الاسم والكود مطلوبان.',
        'Code must be alphanumeric, max 10 chars (e.g. T1, VIP).': 'الكود حروف وأرقام إنجليزية فقط، 10 أحرف كحد أقصى (مثال: T1, VIP).',
        'Saving...': 'جار الحفظ...', 'Cannot edit while table is occupied': 'لا يمكن التعديل والطاولة مشغولة', 'Close bill first': 'أغلق الفاتورة أولًا',
        // ── Dine-in page nav ──
        'POS': 'نقطة البيع', 'Menu Items': 'قائمة الطعام', 'Reports': 'التقارير', 'Admin Panel': 'لوحة التحكم', 'Logout': 'تسجيل الخروج',
        'Management System': 'نظام الإدارة',
        // ── Admin page (listed sections) ──
        'Shop Settings': 'إعدادات المحل', 'Shop Name': 'اسم المحل', 'Receipt Footer': 'تذييل الفاتورة',
        'Dead Stock Threshold (Days)': 'حد المخزون الراكد (بالأيام)', 'Address & Phone': 'العنوان والهاتف',
        'Shop Logo': 'شعار المحل', 'Recommended: 200x200px PNG or JPG': 'يُفضل PNG أو JPG بمقاس 200×200',
        'Save Settings': 'حفظ الإعدادات', 'e.g. Tashgheel Restaurant': 'مثال: مطعم تشغيل',
        'e.g. Thank you for your visit!': 'مثال: شكرًا لزيارتكم!', 'Shop address and contact info...': 'عنوان المحل وبيانات التواصل...',
        'Online Store Link': 'رابط المتجر الأونلاين', 'Share this link with your customers to accept online orders.': 'شارك هذا الرابط مع عملائك لاستقبال الطلبات الأونلاين.',
        'Copy': 'نسخ', 'Open': 'فتح',
        'Feature Toggles': 'التحكم في الميزات',
        'Enable or disable app features across all devices. Changes take effect immediately on next page load.': 'تشغيل أو إيقاف ميزات التطبيق على كل الأجهزة. يسري التغيير فورًا عند أول تحميل للصفحة.',
        'Kitchen Display': 'شاشة المطبخ', 'Show the Kitchen screen link in navigation. Disable for takeaway-only setups.': 'إظهار رابط شاشة المطبخ في القائمة. أوقفها لمحلات التيك أواي فقط.',
        'Dine-In Tables': 'طاولات الصالة', 'Enable table ordering and waiter management features.': 'تفعيل طلبات الطاولات وإدارة الويتر.',
        'Guest QR Ordering': 'طلبات QR للضيوف', 'Let guests order from the table QR code. Orders wait for a waiter to accept them.': 'السماح للضيوف بالطلب من QR الطاولة. الطلبات تنتظر موافقة الويتر.',
        '* Feature toggles are saved in shop settings and synced to all logged-in staff sessions.': '* تُحفظ مفاتيح الميزات في إعدادات المحل وتُزامن مع كل جلسات الموظفين المسجلين.',
        'Manager PIN — Hard Actions': 'رقم المدير السري — الإجراءات الحساسة',
        'Set a 4–6 digit PIN that staff must enter before performing sensitive actions:': 'حدد رقمًا سريًا من 4–6 أرقام يدخله الموظف قبل تنفيذ الإجراءات الحساسة:',
        '. Leave blank to disable PIN requirement.': '. اتركه فارغًا لإلغاء طلب الرقم السري.',
        'New Manager PIN': 'رقم المدير السري الجديد', 'Confirm PIN': 'تأكيد الرقم السري', 'Save PIN': 'حفظ الرقم السري',
        'Remove PIN (Disable)': 'إزالة الرقم السري (إيقاف)', 'e.g. 1234': 'مثال: 1234', 'Repeat PIN': 'أعد إدخال الرقم السري',
        'Multiple Kitchen Printers': 'طابعات مطبخ متعددة',
        'Map product categories to specific printer designations (e.g., Hot Kitchen, Drinks, Bakery). When order items are sent to the kitchen, they will be printed/routed accordingly.': 'ربط أقسام الأصناف بطابعات محددة (مثال: المطبخ الساخن، المشروبات، المخبوزات). عند إرسال أصناف الطلب للمطبخ تُطبع وتُوجه حسب هذا الربط.',
        'Add Printer Designation': 'إضافة تعريف طابعة', 'Save Mappings': 'حفظ الربط',
        // ── Admin: user management section ──
        'User Management': 'إدارة المستخدمين', 'Add New User': 'إضافة مستخدم جديد', 'Username': 'اسم المستخدم',
        'Password': 'كلمة المرور', 'Full Name': 'الاسم الكامل', 'Role': 'الدور', 'Manager': 'مدير', 'Admin': 'مدير النظام',
        'Inventory Manager': 'مسؤول المخزون', 'Technician': 'فني', 'Other...': 'أخرى...', 'Assign Branch': 'تعيين الفرع',
        '-- Select Branch --': '-- اختر الفرع --', 'POS Sales': 'نقطة البيع', 'Menu': 'القائمة', 'Create User': 'إنشاء المستخدم',
        'Existing Users': 'المستخدمون الحاليون', 'User': 'المستخدم', 'Phone': 'الهاتف',
        // ── Guest QR table-order page (table-order.html) ──
        'Welcome': 'أهلًا بك', "Loading your table's menu...": 'جار تحميل قائمة طاولتك...',
        'Something went wrong': 'حدث خطأ ما', 'Please scan the QR code again.': 'من فضلك امسح رمز QR مرة أخرى.',
        'Try Again': 'حاول مرة أخرى', 'Bill is being processed': 'جار تجهيز الفاتورة',
        'Your waiter is processing the bill. Please wait or ask for assistance.': 'الويتر يجهز الفاتورة الآن. من فضلك انتظر أو اطلب المساعدة.',
        'Table': 'طاولة', 'Scan & Order': 'امسح واطلب', 'My Order': 'طلبي', 'All': 'الكل',
        'Total estimate': 'الإجمالي التقديري', 'Send to Kitchen': 'إرسال للمطبخ', 'Only pending items will be sent': 'سيتم إرسال الأصناف المعلقة فقط',
        'Add a note': 'أضف ملاحظة', 'Add Item': 'إضافة الصنف', 'Special request (e.g. no onions)': 'طلب خاص (مثال: بدون بصل)',
        'Pending': 'لم يُرسل', 'Sent': 'تم الإرسال', 'Ready!': 'جاهز!', 'Cancelled': 'ملغي',
        'No items yet. Browse the menu to add.': 'لا توجد أصناف بعد. تصفح القائمة للإضافة.',
        'No items in this category': 'لا توجد أصناف في هذا القسم', 'Your Table': 'طاولتك',
        'Connecting to your table...': 'جار الاتصال بطاولتك...', 'Setting up your order...': 'جار تجهيز طلبك...',
        'Loading menu...': 'جار تحميل القائمة...', 'Refreshing your order...': 'جار تحديث طلبك...',
        'Session expired. Please scan the QR code again.': 'انتهت الجلسة. من فضلك امسح رمز QR مرة أخرى.',
        'Invalid QR code. Please scan the QR code at your table.': 'رمز QR غير صالح. من فضلك امسح الرمز الموجود على طاولتك.',
        'Table not found. Please scan the QR code again.': 'الطاولة غير موجودة. من فضلك امسح الرمز مرة أخرى.',
        'Menu could not be loaded. Please try again.': 'تعذر تحميل القائمة. حاول مرة أخرى.',
        'Could not connect. Please try again.': 'تعذر الاتصال. حاول مرة أخرى.',
        'Choose an available size': 'اختر حجمًا متاحًا', 'Could not add item': 'تعذر إضافة الصنف',
        'Could not remove item': 'تعذر حذف الصنف', 'Could not send order': 'تعذر إرسال الطلب',
        '✅ Order sent to your waiter for approval. It goes to the kitchen once accepted.': '✅ تم إرسال الطلب للويتر للموافقة. سيصل للمطبخ بعد القبول.',
        // ── Dine-in: table cards + table order panel ──
        'Current Draft (Not Sent)': 'مسودة حالية (لم تُرسل)', 'Not sent yet': 'لم يُرسل بعد', 'In kitchen': 'في المطبخ',
        'Search menu items to add...': 'ابحث في أصناف القائمة للإضافة...', 'Taxes': 'الضرائب', 'Bill': 'الحساب',
        // ── Online store page (online_ordering.html) ──
        'Select Branch': 'اختر الفرع', 'Select a Branch': 'اختر الفرع',
        'Choose a store to see the menu & availability': 'اختر الفرع لعرض القائمة والتوفر',
        'Select a branch to view the menu': 'اختر فرعًا لعرض القائمة', 'All Items': 'كل الأصناف',
        'Special Instructions': 'تعليمات خاصة', 'Add to Order': 'أضف للطلب', 'Your Order': 'طلبك',
        'Your cart is empty': 'السلة فارغة', 'Browse Menu': 'تصفح القائمة', 'Tax': 'الضريبة', 'Checkout': 'إتمام الطلب',
        'Order Type': 'نوع الطلب', 'Mobile Number': 'رقم الموبايل', 'Delivery Location Method': 'طريقة تحديد موقع التوصيل',
        'Choose on Map': 'حدد على الخريطة', 'Choose Area': 'اختر المنطقة',
        'Drag pin to your exact delivery location:': 'اسحب الدبوس إلى موقع التوصيل الدقيق:',
        'Locate Me': 'حدد موقعي', '📍 Pin placed. Detecting area...': '📍 تم وضع الدبوس. جار تحديد المنطقة...',
        'Delivery Area': 'منطقة التوصيل', 'Select Area...': 'اختر المنطقة...', 'Building/Apt': 'المبنى/الشقة',
        'Order Total': 'إجمالي الطلب', 'Delivery Fee': 'رسوم التوصيل', 'Final Total': 'الإجمالي النهائي',
        'Place Order': 'تأكيد الطلب', 'Track Order': 'تتبع الطلب', 'Enter Mobile Number': 'أدخل رقم الموبايل',
        'Check': 'بحث', 'Enter number to see history': 'أدخل الرقم لعرض الطلبات السابقة',
        'Order Confirmed!': 'تم تأكيد الطلب!', 'Your order has been sent to the restaurant.': 'تم إرسال طلبك إلى المطعم.',
        'Start New Order': 'بدء طلب جديد', 'My Orders': 'طلباتي', 'e.g., No onions, extra sauce...': 'مثال: بدون بصل، صوص زيادة...',
        'Your Name': 'اسمك', 'Street Name': 'اسم الشارع', 'Apt 4, Floor 2': 'شقة 4، الدور 2',
        'Choose Size:': 'اختر الحجم:', 'Add-ons / Extras:': 'الإضافات:', 'Free': 'مجانًا', 'Remove': 'إزالة',
        'No items found in this category.': 'لا توجد أصناف في هذا القسم.', 'Delicious meal prepared fresh.': 'وجبة لذيذة تُحضر طازجة.',
        'Invalid Store Link': 'رابط المتجر غير صالح', 'Please use the valid link provided by the restaurant.': 'من فضلك استخدم الرابط الصحيح من المطعم.',
        'Loading History...': 'جار تحميل الطلبات السابقة...', 'No orders found for this number': 'لا توجد طلبات لهذا الرقم',
        'Failed to load orders': 'تعذر تحميل الطلبات', 'Details': 'التفاصيل', 'Delivered': 'تم التوصيل',
        'On the Way': 'في الطريق', 'Waiting to Confirm': 'في انتظار التأكيد',
        'Changing branch will clear your cart. Continue?': 'تغيير الفرع سيفرغ السلة. متابعة؟',
        'Please enter mobile number': 'من فضلك أدخل رقم الموبايل', 'Network Error. Please try again.': 'خطأ في الاتصال. حاول مرة أخرى.',
        '⚠️ Pin placed outside predefined zones. Please pick an area below or adjust location.': '⚠️ الدبوس خارج مناطق التوصيل. اختر منطقة من القائمة أو عدّل الموقع.',
        // ── Dine-in table cards & order panel ──
        '🔔 Bill': '🔔 الحساب', '🔒 Bill requested — order locked': '🔒 تم طلب الحساب — الطلب مقفل',
        // ── Admin page extras ──
        'apply discount': 'تطبيق خصم', 'remove item from cart': 'حذف صنف من السلة', 'cancel an invoice': 'إلغاء فاتورة',
        'Product Category': 'قسم الصنف', '-- Select Category --': '-- اختر القسم --', 'Printer Designation': 'تعريف الطابعة',
        '⬜ No PIN set — hard actions (discount, remove item, cancel) require no confirmation.': '⬜ لا يوجد رقم سري — الإجراءات الحساسة (خصم، حذف صنف، إلغاء) لا تتطلب تأكيدًا.',
        // ── Delivery Integrations (Aggregator Hub) ──
        'Delivery Integrations': 'تكاملات التوصيل', 'Aggregator Hub': 'مركز التجميع',
        'Your Webhook URL': 'رابط الويب هوك الخاص بك',
        'Give this URL to the selected delivery provider during onboarding. It is unique to this branch and changes when you pick another provider tab.': 'أعطِ هذا الرابط لمزوّد التوصيل المختار أثناء التفعيل. الرابط خاص بهذا الفرع ويتغير عند اختيار تبويب مزوّد آخر.',
        'Copy': 'نسخ',
        'Enable Talabat Integration': 'تفعيل تكامل طلبات', 'Enable Uber Eats Integration': 'تفعيل تكامل أوبر إيتس',
        'Enable Careem Now Integration': 'تفعيل تكامل كريم ناو', 'Enable Mrsool Integration': 'تفعيل تكامل مرسول',
        'API Key': 'مفتاح API', 'Client ID': 'معرّف العميل', 'Client Secret': 'سر العميل', 'Webhook Secret': 'سر الويب هوك',
        'Enter API Key': 'أدخل مفتاح API', 'Enter Client ID': 'أدخل معرّف العميل', 'Enter Client Secret': 'أدخل سر العميل', 'Enter Webhook Secret': 'أدخل سر الويب هوك',
        'Save Credentials': 'حفظ البيانات', 'Test Connection': 'اختبار الاتصال', 'Sync Menu': 'مزامنة القائمة', 'Remove Keys': 'إزالة المفاتيح',
        'Health Status': 'حالة الاتصال', 'Refresh': 'تحديث',
        '⚪ Not connected': '⚪ غير متصل', 'Not connected': 'غير متصل',
        '🟡 Keys saved, switched off or missing the Webhook Secret': '🟡 المفاتيح محفوظة، لكن التكامل متوقف أو ينقصه سر الويب هوك',
        'Keys saved': 'المفاتيح محفوظة',
        '🟢 Connected': '🟢 متصل', 'Connected': 'متصل',
        'Ready to receive orders. Keys are saved on the server and cannot be viewed.': 'جاهز لاستقبال الطلبات. المفاتيح محفوظة على الخادم ولا يمكن عرضها.',
        '⚪ Not available yet': '⚪ غير متاح بعد', 'Not available yet': 'غير متاح بعد',
        'The connection for this app is not built yet. It will be added once the official API details are available.': 'الاتصال بهذا التطبيق غير جاهز بعد. سيُضاف عند توفر تفاصيل الواجهة الرسمية.',
        'Paste the keys from the delivery app and save.': 'الصق المفاتيح من تطبيق التوصيل واحفظها.',
        'Turn the integration on and add the Webhook Secret to start receiving orders.': 'فعّل التكامل وأضف سر الويب هوك لبدء استقبال الطلبات.',
        'No order received yet.': 'لم يُستلم أي طلب بعد.', 'Failed to load status': 'فشل تحميل الحالة',
        '•••••• saved (leave blank to keep)': '•••••• محفوظ (اتركه فارغًا للإبقاء)',
        '⏳ Checking with the provider...': '⏳ جارٍ التحقق مع المزوّد...', '⏳ Syncing menu...': '⏳ جارٍ مزامنة القائمة...',
        '✅ Keys removed.': '✅ تمت إزالة المفاتيح.', '✅ Menu sent to the provider.': '✅ تم إرسال القائمة للمزوّد.',
        '✅ Saved. Keys are encrypted on the server.': '✅ تم الحفظ. المفاتيح مشفرة على الخادم.',
        '📋 Webhook URL copied!': '📋 تم نسخ رابط الويب هوك!',
        'Remove the saved keys for this delivery app and switch it off?': 'إزالة المفاتيح المحفوظة لهذا التطبيق وإيقافه؟',
        // Admin: taxes, shift history, greeting, Manager PIN sentence glue
        'Save Tax': 'حفظ الضريبة', 'Applies To': 'تُطبق على', 'Configured Taxes': 'الضرائب المضافة', 'Tax Name': 'اسم الضريبة',
        'Percentage': 'النسبة', 'Percentage (%)': 'النسبة (%)', 'Enable Tax by Default': 'تفعيل الضريبة افتراضيًا',
        'Shift History Log': 'سجل الورديات', 'Discrepancy': 'الفرق', 'Actual Drawer': 'الدرج الفعلي', 'Expected Drawer': 'الدرج المتوقع',
        'Opening Cash': 'النقدية الافتتاحية', 'Closed At': 'وقت الإغلاق', 'Opened At': 'وقت الفتح', 'Loading shift history...': 'جار تحميل سجل الورديات...',
        'Branch Management': 'إدارة الفروع', 'Add New Branch': 'إضافة فرع جديد', 'Branch Name': 'اسم الفرع', 'Branch Code': 'كود الفرع',
        'Tax Rate (%)': 'نسبة الضريبة (%)', 'Address': 'العنوان', 'Add Branch': 'إضافة فرع', 'Existing Branches': 'الفروع الحالية', 'Tax %': 'الضريبة %',
        'Taxes & VAT': 'الضرائب وضريبة القيمة المضافة', 'Add New Tax': 'إضافة ضريبة جديدة', 'Enabled': 'مفعّلة', 'Notes': 'ملاحظات', 'Customers': 'العملاء', 'Protected': 'محمي',
        'Please choose a location to continue': 'من فضلك اختر الفرع للمتابعة',
        'View history logs for all cash drawer shifts, Cashier audit figures, expected calculations, physical drawer values, and notes.': 'سجل ورديات الدرج النقدي: أرقام جرد الكاشير، الحسابات المتوقعة، قيم الدرج الفعلية، والملاحظات.',
        // Admin: branch card leftovers (empty state, toasts, confirm/alert, placeholders)
        'No branches yet. Add one above!': 'لا توجد فروع بعد. أضف فرعًا من الأعلى!',
        'Unnamed': 'بدون اسم', 'Branch deleted': 'تم حذف الفرع', 'Branch created!': 'تم إنشاء الفرع!',
        'Delete this branch?': 'حذف هذا الفرع؟', 'Name and code required': 'الاسم والكود مطلوبان',
        'Failed to create branch': 'فشل إنشاء الفرع', 'No taxes configured.': 'لا توجد ضرائب مضافة.',
        'e.g. Main Branch': 'مثال: الفرع الرئيسي', 'Full address...': 'العنوان بالكامل...',
        // Customers page: Areas modal, address modal, map region picker; store cart total
        'Areas': 'المناطق', 'Add New Address': 'إضافة عنوان جديد', 'Save Address': 'حفظ العنوان',
        'Landmark / Directions': 'علامة مميزة / الاتجاهات', '-- Select Area --': '-- اختر المنطقة --',
        'Remove Region Data': 'إزالة بيانات النطاق', 'Search by name or mobile...': 'ابحث بالاسم أو الموبايل...',
        'Delivery Areas & Map Regions': 'مناطق التوصيل ونطاقات الخريطة',
        'Define areas, fees, and set geographic regions on the map.': 'حدّد المناطق والرسوم واضبط النطاقات الجغرافية على الخريطة.',
        'Area Name (e.g. Nasr City)': 'اسم المنطقة (مثال: مدينة نصر)', 'Fee (EGP)': 'الرسوم (ج.م)',
        'Set Region on Map': 'تحديد النطاق على الخريطة', 'Radius (meters):': 'نصف القطر (متر):',
        'Click or drag the pin to set the center, and adjust radius to cover your delivery zone.': 'انقر أو اسحب الدبوس لتحديد المركز، واضبط نصف القطر لتغطية منطقة التوصيل.',
        'Current GPS': 'الموقع الحالي', 'Save Region': 'حفظ النطاق',
        'Delete this area?': 'حذف هذه المنطقة؟', 'Enter valid Name and Fee': 'أدخل اسمًا ورسومًا صحيحة',
        'Geolocation not supported': 'تحديد الموقع غير مدعوم',
        // Reports: profitability rows; products: recipe banner + type hints
        // Products page save/validation alerts (translated via the alert/confirm override)
        // POS online-orders panel
'Set Region': 'تحديد النطاق', 'Edit Map': 'تعديل الخريطة', 'Delete?': 'حذف؟',
                'Online Orders': 'الطلبات الأونلاين', 'Resume': 'استكمال', 'No pending online orders.': 'لا توجد طلبات أونلاين معلقة.',
        'Checking for new orders...': 'جار البحث عن طلبات جديدة...',
        'Resume online order? Current cart will be cleared.': 'استكمال الطلب الأونلاين؟ سيتم إفراغ السلة الحالية.',
        'Take_Away': 'تيك أواي', 'Dine_In': 'صالة',
        'Menu Item Saved!': 'تم حفظ الصنف!', 'Please enter Price.': 'من فضلك أدخل السعر.',
        'Category already exists': 'القسم موجود بالفعل', 'Code already exists!': 'الكود موجود بالفعل!',
        'Enter size name, code, and price': 'أدخل اسم الحجم والكود والسعر',
        'Please add at least one Size Variant.': 'أضف حجمًا واحدًا على الأقل.',
        'Recipe saved and Cost updated!': 'تم حفظ الوصفة وتحديث التكلفة!',
        'Please select ingredient and valid quantity': 'اختر المكون وكمية صحيحة',
        'Select ingredient, unit, and valid quantity': 'اختر المكون والوحدة وكمية صحيحة',
        'PDF Library not loaded': 'مكتبة PDF غير محمّلة',
        'Uncategorized': 'غير مصنّف',
        'Invoice / return adjustments (not allocated to products)': 'تعديلات الفواتير / المرتجعات (غير موزعة على الأصناف)',
        'Editing Recipe for Main Product': 'تعديل وصفة المنتج الرئيسي',
        'Please select a size above': 'اختر حجمًا من الأعلى',
        'For services (e.g. delivery, setup). No recipe, no stock tracking.': 'للخدمات (مثل التوصيل والتجهيز). بدون وصفة وبدون تتبع مخزون.',
        'For pre-packaged items (e.g. bottled water). Direct stock tracking, manual cost.': 'للأصناف الجاهزة المعبأة (مثل المياه المعبأة). تتبع مخزون مباشر وتكلفة يدوية.',
        'For cooked/prepared items (e.g. burgers, coffee). Cost is calculated from recipe ingredients, stock is deduced from raw materials.': 'للأصناف المطهية/المحضّرة (مثل البرجر والقهوة). تُحسب التكلفة من مكونات الوصفة ويُخصم المخزون من الخامات.',
        'Total': 'الإجمالي',
        'Yes, Confirm': 'نعم، تأكيد', 'e.g. HQ': 'مثال: MAIN', 'e.g. Hot Kitchen, Bar': 'مثال: مطبخ ساخن، بار',
        'e.g. VAT, Service Charge': 'مثال: ضريبة القيمة المضافة، رسوم الخدمة', 'e.g. 14': 'مثال: 14',

        'Welcome,': 'أهلًا بك،', 'System Administrator': 'مدير النظام', ',': '،', ', or': '، أو'
    };
    // Case-insensitive lookup (headers are often uppercased in source)
    const L = {};
    Object.keys(D).forEach(k => { L[k.toLowerCase()] = D[k]; });
    const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/;
    function tr(raw) {
        if (!raw) return null;
        const s = raw.replace(/\s+/g, ' ').trim();
        if (!s) return null;
        // English label + Arabic tenant data (tax names, item names): translate before the Arabic guard
        const taxl = s.match(/^Taxes \((.+)\)$/i); if (taxl) return 'الضرائب (' + taxl[1] + ')';
        const addedt = s.match(/^Added (.+)$/i); if (addedt) return 'تمت إضافة ' + addedt[1];
        const addt = s.match(/^Add "(.+)"$/i); if (addt) return 'إضافة "' + addt[1] + '"';
        if (/[\u0600-\u06FF]/.test(s)) return null;
        if (L[s.toLowerCase()]) return L[s.toLowerCase()];
        const tb = s.match(/^Table (\d+)$/i); if (tb) return 'طاولة ' + tb[1];
        const zone = s.match(/^(.+) - ([\d.]+) EGP Delivery$/); if (zone) return zone[1] + ' - ' + zone[2] + ' ج.م توصيل';
        const egp = s.match(/^([\d.,]+) EGP$/); if (egp) return egp[1] + ' ج.م';
        const taxx = s.match(/^(.+\d) Tax$/); if (taxx) return taxx[1] + ' ضريبة';
        const fabv = s.match(/^View Order · (\d+) (?:new )?items?$/); if (fabv) return 'عرض الطلب · ' + fabv[1] + ' صنف';
        const its = s.match(/^([^\w]*\d+) item\(s\)(.*)$/);
        if (its) return its[1] + ' صنف' + its[2].replace('ready!', 'جاهز!').replace('in kitchen', 'في المطبخ');
        const itc = s.match(/^(\d+) items$/); if (itc) return itc[1] + ' صنف';
        const sentb = s.match(/^(\d+) sent$/); if (sentb) return sentb[1] + ' مُرسل';
        const pendb = s.match(/^(\d+) pending$/i); if (pendb) return pendb[1] + ' معلّق';
        const guestb = s.match(/^🔔? ?Guest order \((\d+)\)$/i); if (guestb) return '🔔 طلب ضيف (' + guestb[1] + ')';
        const batchb = s.match(/^Batch (\d+)$/i); if (batchb) return 'الدفعة ' + batchb[1];
        const item1 = s.match(/^(\d+) item$/i); if (item1) return item1[1] + ' صنف';
        const batchs = s.match(/^✅ Batch (\d+) sent — (\d+) item\(s\) to kitchen$/i); if (batchs) return '✅ تم إرسال الدفعة ' + batchs[1] + ' — ' + batchs[2] + ' صنف للمطبخ';
        const moreb = s.match(/^\+(\d+) more$/); if (moreb) return '+' + moreb[1] + ' أصناف';
        const openb = s.match(/^Order open · (\d+) items$/); if (openb) return 'طلب مفتوح · ' + openb[1] + ' صنف';
        const lasto = s.match(/^Last order: (.*)\.$/); if (lasto) return 'آخر طلب: ' + lasto[1] + '.';
        const synci = s.match(/^⚠️ Sync issue: (.*)$/); if (synci) return '⚠️ مشكلة في المزامنة: ' + synci[1];
        const failc = s.match(/^❌ (Check failed|Failed to save|Sync failed): (.*)$/); if (failc) return '❌ ' + ({'Check failed':'فشل التحقق','Failed to save':'فشل الحفظ','Sync failed':'فشلت المزامنة'}[failc[1]]) + ': ' + failc[2];
        const payl = s.match(/^(.+?) · (\d+) item line\(s\)$/); if (payl) { const tb2 = payl[1].match(/^Table (\d+)$/i); return (tb2 ? 'طاولة ' + tb2[1] : payl[1]) + ' · ' + payl[2] + ' سطر'; }
        const edsz = s.match(/^Editing Recipe for Size: (.+)$/); if (edsz) return 'تعديل وصفة الحجم: ' + edsz[1];
        const svf = s.match(/^(Save failed|Removal failed|Recipe needs review): (.*)$/); if (svf) return ({'Save failed':'فشل الحفظ','Removal failed':'فشل الحذف','Recipe needs review':'الوصفة تحتاج مراجعة'}[svf[1]]) + ': ' + svf[2];
        const olt = s.match(/^(DELIVERY|TAKE_AWAY|DINE_IN) \| (.*)$/); if (olt) return ({'DELIVERY':'توصيل','TAKE_AWAY':'تيك أواي','DINE_IN':'صالة'}[olt[1]]) + ' | ' + olt[2].replace(' AM',' ص').replace(' PM',' م');
        const newo = s.match(/^🔔 New Online Order #(\S+)(.*?) \((\d+) pending\)$/); if (newo) return '🔔 طلب أونلاين جديد #' + newo[1] + newo[2] + ' (' + newo[3] + ' معلق)';
        const remzone = s.match(/^Remove geographic region from (.+)\?$/); if (remzone) return 'إزالة النطاق الجغرافي من ' + remzone[1] + '؟';
        const errx = s.match(/^Error: (.+)$/); if (errx && L[errx[1].toLowerCase()]) return 'خطأ: ' + L[errx[1].toLowerCase()];
        const enterl = s.match(/^Enter (.+)$/); if (enterl && L[enterl[1].toLowerCase()]) return 'أدخل ' + L[enterl[1].toLowerCase()];
        const m = s.match(/^([^A-Za-z0-9\u0600-\u06FF]*(?:\d+\.\s+)?)(.*?)([\s:*]*)$/);
        if (!m) return null;
        if (/^[a-z_0-9]+$/.test(m[2])) return null;
        const hit = L[m[2].toLowerCase()] || (m[3].indexOf(':') >= 0 ? L[(m[2] + ':').toLowerCase()] : null);
        if (!hit) return null;
        return m[1].replace(/^\d+\.\s+$/, '') + hit + (L[m[2].toLowerCase()] ? m[3] : m[3].replace(':', ''));
    }
    // Native confirm/alert dialogs are not DOM nodes; translate their messages too.
    const _confirm = window.confirm.bind(window), _alert = window.alert.bind(window);
    window.confirm = function (m) { return _confirm(tr(String(m)) || m); };
    window.alert = function (m) { _alert(tr(String(m)) || m); };
    function walk(root) {
        if (!root) return;
        if (root.nodeType === 3) {
            const p = root.parentElement;
            if (p && (SKIP.test(p.tagName) || /material-/.test(p.getAttribute('class') || ''))) return;
            const r = tr(root.nodeValue);
            if (r) { const v = root.nodeValue; root.nodeValue = (/^\s/.test(v) ? ' ' : '') + r + (/\s$/.test(v) ? ' ' : ''); }
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
