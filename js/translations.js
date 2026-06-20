const translations = {
    // Navigation
    nav_pos: { en: "Point of Sale", ar: "نقطة البيع" },
    nav_products: { en: "Menu Items", ar: "قائمة الطعام" },
    nav_inventory: { en: "Inventory", ar: "المخزون" },
    nav_receipts: { en: "Receipts", ar: "الفواتير" },
    nav_reports: { en: "Reports", ar: "التقارير" },
    nav_employees: { en: "Employees", ar: "الموظفين" },
    nav_kitchen: { en: "Kitchen", ar: "المطبخ" },
    nav_online_ordering: { en: "Online Ordering", ar: "الطلبات الأونلاين" },
    nav_salesmen: { en: "Employees", ar: "الموظفين" },
    nav_expenses: { en: "Expenses", ar: "المصاريف" },
    nav_admin: { en: "Admin Panel", ar: "لوحة التحكم" },
    nav_backup: { en: "Backup", ar: "النسخ الاحتياطي" },
    nav_visits: { en: "Service Visits", ar: "زيارات الخدمة" },
    nav_upcoming: { en: "Upcoming Visits", ar: "الزيارات القادمة" },
    nav_vendors: { en: "Vendors", ar: "الموردين" },
    nav_customers: { en: "Customers", ar: "العملاء" },
    logout: { en: "Logout", ar: "تسجيل الخروج" },

    // General
    date: { en: "Date", ar: "التاريخ" },
    description: { en: "Description", ar: "الوصف" },
    amount: { en: "Amount", ar: "المبلغ" },
    actions: { en: "Actions", ar: "الإجراءات" },
    total: { en: "Total", ar: "الإجمالي" },
    filter: { en: "🔍 Filter", ar: "🔍 فلترة" },
    reset: { en: "🔄 Reset", ar: "🔄 إعادة تعيين" },
    save: { en: "Save", ar: "حفظ" },
    cancel: { en: "Cancel", ar: "إلغاء" },
    delete: { en: "Delete", ar: "حذف" },
    edit: { en: "Edit", ar: "تعديل" },
    view: { en: "View", ar: "عرض" },
    search: { en: "Search...", ar: "بحث..." },

    // Expenses
    expenses: { en: "Expenses", ar: "المصاريف" },
    add_expense: { en: "➕ Add Expense", ar: "➕ إضافة مصروف" },
    expenses_list: { en: "📋 Expenses List", ar: "📋 قائمة المصاريف" },
    seller: { en: "Seller", ar: "البائع" },
    method: { en: "Payment Method", ar: "طريقة الدفع" },
    cash: { en: "Cash", ar: "نقدي" },
    card: { en: "Card", ar: "بطاقة" },
    mobile: { en: "Mobile", ar: "موبايل" },
    category: { en: "Category", ar: "التصنيف" },

    // Reports
    page_title_reports: { en: "Reports - POS", ar: "التقارير - نقطة البيع" },
    reports: { en: "Reports", ar: "التقارير" },
    total_sales: { en: "🧾 Total Sales", ar: "🧾 إجمالي المبيعات" },
    visits_report: { en: "🔧 Visits", ar: "🔧 الزيارات" },
    cogs: { en: "📦 COGS", ar: "📦 تكلفة البضاعة" },
    profit: { en: "💰 Profit", ar: "💰 الربح" },
    returns: { en: "↩️ Returns", ar: "↩️ المرتجعات" },
    sales_by_product: { en: "📦 Sales by Product", ar: "📦 المبيعات حسب المنتج" },
    sales_by_category: { en: "🗂️ Sales by Category", ar: "🗂️ المبيعات حسب التصنيف" },
    sales_by_user: { en: "👤 Sales by User", ar: "👤 المبيعات حسب المستخدم" },
    stock_value: { en: "🏷️ Stock Value", ar: "🏷️ قيمة المخزون" },
    cash_sales: { en: "Cash Sales", ar: "مبيعات نقدية" },
    card_sales: { en: "Card Sales", ar: "مبيعات بطاقة" },
    mobile_sales: { en: "Mobile Sales", ar: "مبيعات موبايل" },
    total_discounts: { en: "Total Discounts", ar: "إجمالي الخصومات" },
    visits_count: { en: "Visits Count", ar: "عدد الزيارات" },
    visits_price: { en: "Visits Price", ar: "إيرادات الزيارات" },
    total_expenses: { en: "Total Expenses", ar: "إجمالي المصاريف" },
    from: { en: "From:", ar: "من:" },
    to: { en: "To:", ar: "إلى:" },

    // Admin
    admin_panel: { en: "Admin Panel", ar: "لوحة التحكم" },
    shop_settings: { en: "Shop Settings", ar: "إعدادات المتجر" },
    shop_name: { en: "Shop Name", ar: "اسم المتجر" },
    shop_address: { en: "Shop Address", ar: "عنوان المتجر" },
    footer_message: { en: "Receipt Footer Message", ar: "رسالة تذييل الفاتورة" },
    shop_logo: { en: "Shop Logo", ar: "شعار المتجر" },
    user_management: { en: "User Management", ar: "إدارة المستخدمين" },
    username: { en: "Username", ar: "اسم المستخدم" },
    password: { en: "Password", ar: "كلمة المرور" },
    fullname: { en: "Full Name", ar: "الاسم الكامل" },
    role: { en: "Role", ar: "الدور" },
    create_user: { en: "Create User", ar: "إنشاء مستخدم" },
    cashier: { en: "Cashier", ar: "كاشير" },
    technician: { en: "Technician", ar: "فني" },
    inventory_manager: { en: "Inventory Manager", ar: "مدير مخزون" },
    manager: { en: "Manager", ar: "مدير" },
    admin: { en: "Admin", ar: "مسؤول" },

    // Backup
    backup: { en: "Backup", ar: "النسخ الاحتياطي" },
    create_backup: { en: "📥 Create Backup", ar: "📥 إنشاء نسخة احتياطية" },
    create_backup_desc: { en: "Download a full backup of your current data.", ar: "تحميل نسخة كاملة من بياناتك الحالية." },
    create_backup_btn: { en: "💾 Download Backup", ar: "💾 تحميل النسخة" },
    restore_backup: { en: "📤 Restore Backup", ar: "📤 استعادة نسخة احتياطية" },
    restore_backup_desc: { en: "Warning: Restoring will overwrite your current data!", ar: "تحذير: الاستعادة ستمسح البيانات الحالية!" },
    restore_backup_btn: { en: "⚠️ Restore Backup", ar: "⚠️ استعادة النسخة" },
    auto_backup_settings: { en: "🔄 Automatic Backup", ar: "🔄 النسخ الاحتياطي التلقائي" },
    auto_backup_desc: { en: "Configure where to save your daily backups automatically.", ar: "قم بتهيئة مكان حفظ النسخ الاحتياطية اليومية تلقائياً." },
    enable_auto_backup: { en: "Enable Daily Automatic Backup", ar: "تفعيل النسخ الاحتياطي اليومي" },
    backup_location: { en: "Backup Location", ar: "مسار النسخ الاحتياطي" },
    choose_folder_btn: { en: "📂 Choose Folder...", ar: "📂 اختر المجلد..." },

    // Vendors & Customers
    vendors: { en: "Vendors", ar: "الموردين" },
    customers: { en: "Customers", ar: "العملاء" },
    add_vendor: { en: "Add Vendor", ar: "إضافة مورد" },
    add_customer: { en: "Add Customer", ar: "إضافة عميل" },
    phone: { en: "Phone", ar: "الهاتف" },
    email: { en: "Email", ar: "البريد الإلكتروني" },
    address: { en: "Address", ar: "العنوان" },
    balance: { en: "Balance", ar: "الرصيد" },

    // Dashboard / General Labels
    welcome: { en: "Welcome", ar: "مرحباً" },
    logout_confirm: { en: "Are you sure you want to logout?", ar: "هل أنت متأكد أنك تريد تسجيل الخروج؟" },

    // POS Specific
    scan_btn: { en: "📷 Scan", ar: "📷 مسح" },
    cart_title: { en: "🛒 Cart", ar: "🛒 السلة" },
    cart_empty: { en: "Cart is empty", ar: "السلة فارغة" },
    subtotal: { en: "Subtotal:", ar: "الإجمالي الفرعي:" },
    discount: { en: "Discount:", ar: "الخصم:" },
    tax: { en: "Tax (0%):", ar: "الضريبة (٠٪):" },
    hold_btn: { en: "⏸️ Hold", ar: "⏸️ تعليق" },
    clear_cart_btn: { en: "🗑️ Clear", ar: "🗑️ مسح" },
    close_day_btn: { en: "Receipts & Close Day", ar: "الفواتير وإقفال اليومية" },
    day_summary_title: { en: "📊 Day Summary", ar: "📊 ملخص اليوم" },
    print_btn: { en: "🖨️ Print", ar: "🖨️ طباعة" },
    close_btn: { en: "✖️ Close", ar: "✖️ إغلاق" },
    salesman_label: { en: "Salesman:", ar: "البائع:" },
    discount_modal_title: { en: "🧾 Discount", ar: "🧾 خصم" },
    discount_type: { en: "Discount Type", ar: "نوع الخصم" },
    discount_value: { en: "Value", ar: "القيمة" },
    discount_none: { en: "None", ar: "لا يوجد" },
    discount_percent: { en: "Percentage (%)", ar: "نسبة مئوية (%)" },
    discount_fixed: { en: "Fixed Value", ar: "قيمة ثابتة" },
    insufficient_stock: { en: "Insufficient stock", ar: "المخزون غير كاف" },
    product_out_of_stock: { en: "Product is out of stock", ar: "المنتج نفد من المخزون" },
    receipt_not_found: { en: "Receipt not found", ar: "الفاتورة غير موجودة" },
    confirm_clear_cart: { en: "Clear cart?", ar: "مسح السلة؟" },


    // POS Order Types & Tables
    order_type: { en: "Order Type", ar: "نوع الطلب" },
    dine_in: { en: "🍽️ Dine In", ar: "🍽️ صالة" },
    take_away: { en: "🥡 Take Away", ar: "🥡 تيك أواي" },
    delivery: { en: "🛵 Delivery", ar: "🛵 توصيل" },
    table_label: { en: "Table:", ar: "الطاولة:" },
    select_table: { en: "Select Table", ar: "اختر الطاولة" },
    table: { en: "Table", ar: "طاولة" },
    waiter: { en: "Waiter:", ar: "الويتر:" },
    alert_select_table: { en: "Please select a table for Dine In orders.", ar: "يرجى اختيار طاولة للطلبات الداخلية." },
    alert_select_waiter: { en: "Please select a waiter for Dine In orders.", ar: "يرجى اختيار ويتر للطلبات الداخلية." },
    alert_select_delivery_man: { en: "Please select a Delivery Man.", ar: "يرجى اختيار الطيار." },
    role_salesman: { en: "Salesman / Waiter", ar: "بائع / ويتر" },
    role_delivery: { en: "Delivery Man", ar: "طيار" },
    role: { en: "Role", ar: "الوظيفة" },
    delivery_man: { en: "Delivery Man:", ar: "الطيار:" },

    // Login & Activation
    // Shift Management
    close_shift_btn: { en: 'Close Shift', ar: 'إغلاق الوردية' },
    open_shift_btn: { en: 'Open Shift', ar: 'فتح وردية' },
    start_shift: { en: 'Start Shift', ar: 'بدء وردية' },
    new_shift: { en: 'New Shift', ar: 'وردية جديدة' },
    opening_cash: { en: 'Opening Cash', ar: 'عهدة البداية' },
    closing_cash: { en: 'Closing Cash', ar: 'عهدة النهاية' },
    expected_cash: { en: 'Expected Cash', ar: 'النقد المتوقع' },
    difference: { en: 'Difference', ar: 'العجز / الزيادة' },
    shift_active: { en: 'Shift Active', ar: 'الوردية نشطة' },
    shift_opened_at: { en: 'Opened:', ar: 'فتحت:' },
    confirm_start_shift: { en: 'Start new shift? Receipt counter will reset to 001.', ar: 'بدء وردية جديدة؟ سيتم إعادة تعيين عداد الفواتير إلى ٠٠١.' },
    shift_started: { en: 'New Shift Started! Receipt # reset to 001.', ar: 'تم بدء وردية جديدة! تم تصفير عداد الفواتير.' },

    // Kitchen Display
    nav_kitchen: { en: "Kitchen", ar: "المطبخ" },
    kitchen_view: { en: "Kitchen View", ar: "شاشة المطبخ" },
    refresh: { en: "Refresh", ar: "تحديث" },
    waiting_orders: { en: "Waiting for orders...", ar: "بانتظار الطلبات..." },
    all_completed: { en: "All orders completed!", ar: "جميع الطلبات مكتملة!" },
    waiting_new_orders: { en: "Waiting for new orders...", ar: "بانتظار طلبات جديدة..." },
    status_preparing: { en: "PREPARING", ar: "تحت التجهيز" },
    complete_order: { en: "Complete Order", ar: "إكمال الطلب" },
    confirm_complete_order: { en: "Mark this order as complete?", ar: "تحديد الطلب كمكتمل؟" },
    order_completed: { en: "Order Completed", ar: "تم إكمال الطلب" },
    minute_short: { en: "m", ar: "د" },

    // Existing keys continue below...
    shop_pos_system: { en: 'F&B POS System', ar: 'نظام كاشير المطاعم' },
    enhanced_security: { en: "Powered By itqan", ar: "بواسطة اتقان" },
    login_btn: { en: "🚀 Launch System", ar: "🚀 تشغيل النظام" },
    activation_required: { en: "System Activation Required", ar: "مطلوب تفعيل النظام" },
    license_key: { en: "License Key", ar: "مفتاح الترخيص" },
    business_name: { en: "Business Name", ar: "اسم النشاط التجاري" },
    activate_license: { en: "Activate License", ar: "تفعيل الترخيص" },
    license_info: { en: "License Information", ar: "معلومات الترخيص" },
    business: { en: "Business", ar: "النشاط" },
    activated: { en: "Activated", ar: "تم التفعيل" },
    status: { en: "Status", ar: "الحالة" },
    security_features: { en: "🔐 Security Features", ar: "🔐 مزايا الأمان" },
    feature1: { en: "One-time license activation", ar: "تفعيل لمرة واحدة فقط" },
    feature2: { en: "Encrypted data storage", ar: "تخزين البيانات بشكل مشفر" },
    feature3: { en: "Automatic secure backups", ar: "نسخ احتياطية تلقائية" },
    feature4: { en: "Multi-language support", ar: "دعم متعدد اللغات" },
    feature5: { en: "Role-based access control", ar: "صلاحيات وصول حسب الدور" },
    feature6: { en: "Receipt printing with logo", ar: "طباعة الإيصالات بالشعار" },

    // JS Alerts & Messages
    fill_required_fields: { en: "Please fill required fields", ar: "يرجى تعبئة الحقول المطلوبة" },
    part_exists: { en: "Part Number already exists.", ar: "رقم القطعة موجود مسبقاً." },
    part_saved: { en: "Part saved successfully!", ar: "تم حفظ القطعة بنجاح!" },
    delete_part_confirm: { en: "Delete this part?", ar: "هل أنت متأكد من حذف هذه القطعة؟" },
    part_not_found: { en: "Part not found", ar: "القطعة غير موجودة" },
    stock_audit_saved: { en: "Stock audit saved.", ar: "تم حفظ جرد المخزون." },

    vendor_load_error: { en: "Error loading vendors: ", ar: "خطأ في تحميل الموردين: " },
    vendor_added: { en: "Vendor added!", ar: "تمت إضافة المورد!" },
    vendor_updated: { en: "Vendor updated successfully!", ar: "تم تحديث بيانات المورد بنجاح!" },
    delete_vendor_confirm: { en: "Delete this vendor?", ar: "هل أنت متأكد من حذف هذا المورد؟" },
    payment_amount_error: { en: "Payment amount must be greater than 0", ar: "مبلغ الدفع يجب أن يكون أكبر من 0" },
    payment_recorded: { en: "Payment recorded successfully!", ar: "تم تسجيل الدفع بنجاح!" },

    delete_customer_confirm: { en: "Are you sure you want to delete this customer?", ar: "هل أنت متأكد من حذف هذا العميل؟" },
    delete_vehicle_confirm: { en: "Delete this vehicle?", ar: "هل أنت متأكد من حذف هذه المركبة؟" },

    visit_out_of_stock: { en: "Out of stock!", ar: "نفد من المخزون!" },
    visit_stock_limit: { en: "Cannot add more than stock.", ar: "لا يمكن إضافة أكثر من المتوفر في المخزون." },
    visit_draft_saved: { en: "✅ Draft saved successfully! Visit ID: ", ar: "✅ تم حفظ المسودة بنجاح! رقم الزيارة: " },
    visit_finish_confirm: { en: "Finish Visit and Generate Invoice? This cannot be undone.", ar: "إنهاء الزيارة وإصدار الفاتورة؟ لا يمكن التراجع عن هذا الإجراء." },
    visit_stock_error: { en: "Error: Not enough stock for ", ar: "خطأ: المخزون غير كافٍ لـ " },
    visit_save_error: { en: "Error saving visit!", ar: "خطأ في حفظ الزيارة!" },
    visit_delete_confirm: { en: "Are you sure you want to delete this draft visit?", ar: "هل أنت متأكد من حذف مسودة الزيارة هذه؟" },
    visit_deleted: { en: "✅ Draft visit deleted", ar: "✅ تم حذف المسودة" },

    no_products_found: { en: "No products found", ar: "لم يتم العثور على منتجات" },
    currency: { en: "EGP", ar: "ج.م" },
    stock: { en: "Stock", ar: "المخزون" },
    print_function_not_available: { en: "Print function not available", ar: "وظيفة الطباعة غير متاحة" },
    receipt: { en: "Receipt", ar: "فاتورة" },
    receipt_no: { en: "Receipt No", ar: "رقم الفاتورة" },
    total_discounts: { en: "Total Discounts", ar: "إجمالي الخصومات" },
    net_before_expenses: { en: "Net before expenses", ar: "الصافي قبل المصاريف" },
    net_after_expenses: { en: "Net After Expenses", ar: "الصافي بعد المصاريف" },
    unit_price: { en: "Price", ar: "السعر" },
    qty: { en: "Qty", ar: "الكمية" },
    name: { en: "Name", ar: "الاسم" },
    code: { en: "Code", ar: "الكود" },

    // Customers Page
    upcoming_visits_title: { en: "📅 Upcoming Scheduled Visits", ar: "📅 الزيارات المجدولة القادمة" },
    search_placeholder_customers: { en: "Search by name, mobile, plate...", ar: "بحث بالاسم، الموبايل، اللوحة..." },
    add_new_customer: { en: "Add New Customer", ar: "إضافة عميل جديد" },
    customer_details: { en: "Customer Details", ar: "تفاصيل العميل" },
    add_vehicle: { en: "Add Vehicle", ar: "إضافة مركبة" },
    vin_no: { en: "VIN / Chassis No", ar: "رقم الشاسية" },
    engine_no: { en: "Engine No", ar: "رقم المحرك" },
    notes_optional: { en: "Notes (Optional)", ar: "ملاحظات (اختياري)" },
    vehicle_optional: { en: "Vehicle (Optional)", ar: "المركبة (اختياري)" },
    plate_number: { en: "Plate Number", ar: "رقم اللوحة" },
    brand: { en: "Brand", ar: "الماركة" },
    model: { en: "Model", ar: "الموديل" },
    year: { en: "Year", ar: "السنة" },
    color: { en: "Color", ar: "اللون" },
    save_customer: { en: "Save Customer", ar: "حفظ العميل" },
    save_vehicle: { en: "Save Vehicle", ar: "حفظ المركبة" },
    vehicles: { en: "Vehicles", ar: "المركبات" },
    delete_customer_confirm: { en: "Are you sure you want to delete this customer? This will delete all their vehicles too.", ar: "هل أنت متأكد أنك تريد حذف هذا العميل؟ سيؤدي هذا إلى حذف جميع مركباته أيضًا." },
    delete_vehicle_confirm: { en: "Are you sure you want to delete this vehicle?", ar: "هل أنت متأكد أنك تريد حذف هذه المركبة؟" },

    // Products Page
    add_product: { en: "Add Product", ar: "إضافة منتج" },
    save_part: { en: "Save Part", ar: "حفظ القطعة" },
    barcode: { en: "Barcode", ar: "الباركود" },
    price: { en: "Price", ar: "السعر" },
    cost: { en: "Cost", ar: "التكلفة" },
    image: { en: "Image", ar: "صورة" },
    image_url: { en: "Image URL", ar: "رابط الصورة" },
    product_list: { en: "Menu Items List", ar: "قائمة الأصناف" },
    manage_categories: { en: "Manage Categories", ar: "إدارة التصنيفات" },
    new_category: { en: "New Category", ar: "تصنيف جديد" },
    add_category: { en: "Add Category", ar: "إضافة تصنيف" },
    allowed_addons: { en: "Allowed Add-ons (Extras)", ar: "الإضافات المتاحة" },
    addons_hint: { en: "Select items from the 'Add-ons' category.", ar: "اختر عناصر من تصنيف 'الإضافات'." },
    allow_all_addons: { en: "Allow All Add-ons", ar: "إتاحة جميع الإضافات" },
    select_addons: { en: "Select Extras", ar: "اختر الإضافات" },
    select_size: { en: "Select Size", ar: "اختر الحجم" },
    add_to_cart: { en: "Add to Cart", ar: "إضافة للسلة" },
    net_qty: { en: "Net Qty", ar: "الكمية الصافية" },
    part_no: { en: "Code", ar: "الكود" },
    part_name: { en: "Item Name", ar: "اسم الصنف" },
    actual_stock: { en: "Actual Stock", ar: "الرصيد الفعلي" },
    difference: { en: "Difference", ar: "الفرق" },
    stock_audit: { en: "Stock Audit", ar: "جرد المخزون" },
    stock_audit_btn: { en: "📋 Stock Audit", ar: "📋 جرد المخزون" },
    fill_required_fields: { en: "Please fill all required fields.", ar: "يرجى ملء جميع الحقول المطلوبة." },
    part_exists: { en: "Part Number already exists!", ar: "رقم القطعة موجود بالفعل!" },
    part_saved: { en: "Part saved successfully!", ar: "تم حفظ القطعة بنجاح!" },
    delete_part_confirm: { en: "Are you sure you want to delete this part?", ar: "هل أنت متأكد أنك تريد حذف هذه القطعة؟" },
    part_not_found: { en: "Part not found!", ar: "القطعة غير موجودة!" },
    stock_audit_saved: { en: "Stock audit saved!", ar: "تم حفظ جرد المخزون!" },

    // Receipts Page
    receipts_title: { en: "Receipts", ar: "الفواتير" },
    all_receipts: { en: "All Receipts", ar: "كل الفواتير" },
    all_status: { en: "All Status", ar: "كل الحالات" },
    finished: { en: "Finished", ar: "مكتمل" },
    partial_return: { en: "Partial Return", ar: "مرتجع جزئي" },
    full_return: { en: "Full Return", ar: "مرتجع كلي" },
    cancelled: { en: "Cancelled", ar: "ملغي" },
    return_reason: { en: "Return Reason", ar: "سبب الإرجاع" },
    total_after_discount: { en: "Total (After Discount)", ar: "الإجمالي (بعد الخصم)" },
    payment: { en: "Payment", ar: "طريقة الدفع" },
    partial_return_modal: { en: "Partial Return", ar: "إرجاع جزئي" },
    return_reason_placeholder: { en: "Reason for return...", ar: "سبب الإرجاع..." },
    confirm: { en: "Confirm", ar: "تأكيد" },
    id: { en: "ID", ar: "م" },

    // Salesmen Page
    delete_employee_confirm: { en: "Are you sure you want to delete this employee?", ar: "هل أنت متأكد من حذف هذا الموظف؟" },
    confirm_logout: { en: "Are you sure you want to logout?", ar: "هل أنت متأكد أنك تريد تسجيل الخروج؟" },
    save: { en: "Save", ar: "حفظ" },
    employees_management: { en: "Employees Management", ar: "إدارة الموظفين" },
    add_employee: { en: "Add Employee", ar: "إضافة موظف" },
    employee_name: { en: "Employee Name", ar: "اسم الموظف" },
    employees_list: { en: "Employees List", ar: "قائمة الموظفين" },
    set_monthly_target: { en: "Set Monthly Target", ar: "تحديد الهدف الشهري" },
    employee: { en: "Employee", ar: "الموظف" },
    month: { en: "Month", ar: "الشهر" },
    target_egp: { en: "Target (EGP)", ar: "المستهدف (ج.م)" },
    monthly_targets: { en: "Monthly Targets", ar: "الأهداف الشهرية" },
    target: { en: "Target", ar: "المستهدف" },
    monthly_performance: { en: "Monthly Performance", ar: "الأداء الشهري" },
    achieved: { en: "Achieved", ar: "المحقق" },
    percentage: { en: "%", ar: "%" },
    lbl_salesmen_list: { en: "Employees List", ar: "قائمة الموظفين" },

    // Visits Page
    customer_vehicle: { en: "Customer & Vehicle", ar: "العميل والمركبة" },
    technician_label: { en: "Technician / Employee", ar: "الفني / الموظف" },
    current_mileage: { en: "Current Mileage (KM)", ar: "العداد الحالي (كم)" },
    mileage_placeholder: { en: "e.g., 45000", ar: "مثلاً ٤٥٠٠٠" },
    mileage_hint: { en: "💡 Record the odometer reading for maintenance tracking", ar: "💡 سجل قراءة العداد لمتابعة الصيانة" },
    add_service: { en: "+ Add Service", ar: "+ إضافة خدمة" },
    add_part: { en: "+ Add Part", ar: "+ إضافة قطعة" },
    visit_notes: { en: "Visit Notes", ar: "ملاحظات الزيارة" },
    schedule_next_visit_opt: { en: "📅 Schedule Next Visit (Optional)", ar: "📅 جدولة الزيارة القادمة (اختياري)" },
    schedule_follow_up: { en: "Schedule a follow-up visit for this customer", ar: "جدولة زيارة متابعة لهذا العميل" },
    next_visit_date: { en: "Next Visit Date:", ar: "تاريخ الزيارة القادمة:" },
    service_type: { en: "Service Type:", ar: "نوع الخدمة:" },
    reminder_notes: { en: "Reminder Notes:", ar: "ملاحظات التذكير:" },
    reminder_hint: { en: "💡 This will create a reminder on the Customers page", ar: "💡 سيتم إنشاء تذكير في صفحة العملاء" },
    labor_total: { en: "Labor Total:", ar: "إجمالي المصنعية:" },
    parts_total: { en: "Parts Total:", ar: "إجمالي القطع:" },
    subtotal_label: { en: "Subtotal:", ar: "الإجمالي الفرعي:" },
    tax_label: { en: "Tax (14%)", ar: "الضريبة (١٤٪)" },
    discount_label: { en: "Discount:", ar: "الخصم:" },
    total_label: { en: "Total:", ar: "الإجمالي:" },
    save_draft: { en: "💾 Save Draft", ar: "💾 حفظ مسودة" },
    finish_invoice: { en: "✅ Finish & Invoice", ar: "✅ إنهاء وإصدار فاتورة" },
    select_technician: { en: "Select Technician", ar: "اختر الفني" },
    new_visit: { en: "New Visit", ar: "زيارة جديدة" },
    active_visits: { en: "Active Visits", ar: "الزيارات النشطة" },
    services_labor: { en: "Services (Labor)", ar: "الخدمات (مصنعية)" },
    spare_parts_title: { en: "Spare Parts", ar: "قطع الغيار" },
    summary_title: { en: "Summary", ar: "الملخص" },
    search_placeholder_visit: { en: "Search by vehicle, customer...", ar: "بحث بالمركبة، العميل..." },
    maintenance_reminders: { en: "Maintenance Reminders", ar: "تذكيرات الصيانة" },
    days_ago: { en: "days ago", ar: "أيام مضت" },
    last_service: { en: "Last Service:", ar: "آخر خدمة:" },
    no_active_visits: { en: "No active visits. Start a new one!", ar: "لا توجد زيارات نشطة. ابدأ زيارة جديدة!" },
    showing_top_50: { en: "Showing top 50 results. Refine search.", ar: "إظهار أول ٥٠ نتيجة. ابحث للمزيد." },
    no_match: { en: "No match.", ar: "لم يتم العثور على نتيجة." },
    confirm_add_service: { en: "Add", ar: "إضافة" },
    service_desc: { en: "Service Description", ar: "وصف الخدمة" },
    service_cost: { en: "Cost", ar: "التكلفة" },
    part_select_title: { en: "Select Part", ar: "اختر قطعة" },
    search_part_placeholder: { en: "Search part...", ar: "بحث عن قطعة..." },
    add_service_title: { en: "Add Service", ar: "إضافة خدمة" },
    select_customer_vehicle: { en: "Select Customer & Vehicle", ar: "اختر العميل والمركبة" },
    search_customer_placeholder: { en: "Search customer or plate...", ar: "بحث عن عميل أو لوحة..." },
    new_customer: { en: "+ New Customer", ar: "+ عميل جديد" },
    // Upcoming Visits Page
    upcoming_visits_title: { en: "📅 Upcoming Visits", ar: "📅 الزيارات القادمة" },
    from_date: { en: "From Date", ar: "من تاريخ" },
    to_date: { en: "To Date", ar: "إلى تاريخ" },
    status_filter: { en: "Status", ar: "الحالة" },
    all: { en: "All", ar: "الكل" },
    overdue: { en: "Overdue", ar: "متأخرة" },
    today: { en: "Today", ar: "اليوم" },
    tomorrow: { en: "Tomorrow", ar: "غداً" },
    this_week: { en: "This Week", ar: "هذا الأسبوع" },
    days: { en: "days", ar: "أيام" },
    apply_filter: { en: "Apply", ar: "تطبيق" },
    go_to_visits: { en: "Go to Visits", ar: "الذهاب للزيارات" },
    no_upcoming_found: { en: "No upcoming visits found matching filters", ar: "لا توجد زيارات قادمة تطابق البحث" },
    service: { en: "Service", ar: "الخدمة" },

    // Existing:
    customer_vehicle: { en: "Customer & Vehicle", ar: "العميل والمركبة" },

    // Inventory Dashboard & Badges
    expired_badge: { en: "Expired", ar: "منتهي للصلاحية" },
    expiring_soon_badge: { en: "Expiring Soon", ar: "ينتهي قريباً" },
    dead_stock_badge: { en: "Dead Stock (>30d)", ar: "مخزون راكد (>٣٠ يوم)" },
    dead_stock_days: { en: "Dead Stock Threshold (Days)", ar: "حد المخزون الراكد (بالأيام)" },
    healthy_stock_badge: { en: "Healthy Stock", ar: "مخزون صحي" },
    no_materials_found: { en: "No materials found.", ar: "لم يتم العثور على مواد." },
    base_cash: { en: "Base", ar: "أساس" },
    overage: { en: "Overage", ar: "زيادة" },
    shortage: { en: "Shortage", ar: "عجز" },
    sales_cash: { en: "Sales (Cash)", ar: "مبيعات (نقد)" },
    opening: { en: "Opening", ar: "الافتتاحية" },
    expected: { en: "Expected", ar: "المتوقع" },
    physical_cash: { en: "Physical Cash", ar: "النقد الفعلي" },
    shift_notes_placeholder: { en: "Shift notes...", ar: "ملاحظات الوردية..." },
    close_shift_confirm: { en: "Are you sure you want to close your shift? This will log you out.", ar: "هل أنت متأكد من إغلاق الوردية؟ سيتم تسجيل خروجك." },
    shift_closed_success: { en: "Shift closed successfully! Difference: ", ar: "تم إغلاق الوردية بنجاح! الفارق: " },
    failed_open_shift: { en: "Failed to open shift", ar: "فشل فتح الوردية" },
    failed_close_shift: { en: "Failed to close shift", ar: "فشل إغلاق الوردية" },
    slow_stock: { en: "Slow", ar: "بطيء" },
    healthy: { en: "Healthy", ar: "نشط" },
    dead: { en: "Dead", ar: "راكد" },
    exp_days: { en: "Exp: ", ar: "باقي: " },
    days_suffix: { en: "d", ar: "ي" },

    // Additional App-Wide Keys
    management_system: { en: "Management System", ar: "نظام الإدارة" },
    search_products: { en: "Search products...", ar: "ابحث عن منتج..." },
    all_categories: { en: "All", ar: "الكل" },
    online_ordering: { en: "Online Ordering", ar: "الطلبات الأونلاين" },
    welcome_user: { en: "Welcome,", ar: "مرحباً،" },
    shift_active_label: { en: "SHIFT ACTIVE", ar: "الوردية نشطة" },
    base_label: { en: "Base", ar: "الأساس" },
};

function setLanguage(lang) {
    if (!lang) lang = localStorage.getItem('pos_language') || 'en';
    localStorage.setItem('pos_language', lang);

    // Update Body Direction
    document.body.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; // Update HTML tag
    document.documentElement.lang = lang; // Update lang attribute

    if (lang === 'ar') {
        document.body.classList.add('rtl');
        document.body.classList.remove('ltr');
    } else {
        document.body.classList.add('ltr');
        document.body.classList.remove('rtl');
    }

    // Update Elements with data-i18n attribute (legacy)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[key]) {
            el.dataset.originalText = el.dataset.originalText || el.textContent; // Store original
            el.textContent = translations[key][lang];
        }
    });

    // Update Elements with data-i18n-key attribute (newer)
    document.querySelectorAll('[data-i18n-key]').forEach(el => {
        const key = el.getAttribute('data-i18n-key');
        if (translations[key]) {
            // Preserve child elements (icons, spans, etc.) — only update text nodes
            const childElements = Array.from(el.children);
            if (childElements.length > 0) {
                // Has child HTML elements — find and update only the last text node
                let foundText = false;
                for (let i = el.childNodes.length - 1; i >= 0; i--) {
                    if (el.childNodes[i].nodeType === Node.TEXT_NODE && el.childNodes[i].textContent.trim()) {
                        el.childNodes[i].textContent = ' ' + translations[key][lang];
                        foundText = true;
                        break;
                    }
                }
                if (!foundText) {
                    // Append text after existing children
                    el.appendChild(document.createTextNode(' ' + translations[key][lang]));
                }
            } else {
                // Simple text-only element — safe to replace
                el.textContent = translations[key][lang];
            }
        }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[key]) {
            el.placeholder = translations[key][lang];
        }
    });

    // Update active state of language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
        // Assuming buttons have data-lang="en" or onclick="setLanguage('en')"
        // We can check text content or ID if available
        if (btn.textContent.includes('EN') || btn.textContent.includes('English')) {
            btn.classList.toggle('active', lang === 'en');
        }
        if (btn.textContent.includes('AR') || btn.textContent.includes('العربية')) {
            btn.classList.toggle('active', lang === 'ar');
        }
    });

    // Dispatch event for other scripts to hook into
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    const lang = localStorage.getItem('pos_language') || 'en';
    setLanguage(lang);

    // Bind buttons if they exist
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Try to get lang from data attribute first
            const newLang = btn.getAttribute('data-lang') || (btn.textContent.includes('AR') ? 'ar' : 'en');
            setLanguage(newLang);
        });
    });
});

// Expose to window
window.translations = translations;
window.setLanguage = setLanguage;
