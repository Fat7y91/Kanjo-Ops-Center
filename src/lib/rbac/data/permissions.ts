/**
 * Generated capability catalogue.
 *
 * Mirrors `app.permissions` exactly (104 rows). This file is data, not logic,
 * and lives under `data/` so it is exempt from the source-file line budget.
 *
 * Source query:
 *   select key, label, description, group_key, sort_order
 *     from app.permissions order by sort_order, key;
 *
 * Regenerate it after any permission migration. The key set must match the
 * database key-for-key; `permissions.ts` derives the `Permission` union from
 * this array, so a key missing here is invisible to every UI guard.
 */

export type PermissionDefinition = {
  key: string;
  label: string;
  description: string;
  group: string;
};

export const PERMISSIONS = [
  /* ── 1. مساحة العمل ── */
  {
    key: "view_overview",
    label: "عرض النظرة العامة",
    description: "فتح النظرة العامة للمؤسسة والمؤشرات الرئيسية.",
    group: "مساحة العمل",
  },
  {
    key: "view_finance",
    label: "عرض الملخص المالي",
    description: "الاطلاع على اللقطة المالية في النظرة العامة.",
    group: "مساحة العمل",
  },
  /* ── 2. نظرة عامة ── */
  {
    key: "view_overview_contracts",
    label: "نظرة عامة · العقود",
    description: "عرض مؤشرات العقود في النظرة العامة.",
    group: "نظرة عامة",
  },
  {
    key: "view_overview_negotiation",
    label: "نظرة عامة · التفاوض",
    description: "عرض مؤشرات التفاوض والزيارات في النظرة العامة.",
    group: "نظرة عامة",
  },
  {
    key: "view_overview_finance",
    label: "نظرة عامة · المالية",
    description: "عرض اللقطة المالية في النظرة العامة.",
    group: "نظرة عامة",
  },
  {
    key: "view_overview_catalog",
    label: "نظرة عامة · الكتالوج",
    description: "عرض مؤشرات الكتالوج في النظرة العامة.",
    group: "نظرة عامة",
  },
  {
    key: "view_overview_compliance",
    label: "نظرة عامة · الالتزام",
    description: "عرض مؤشرات الالتزام والجودة في النظرة العامة.",
    group: "نظرة عامة",
  },
  {
    key: "view_overview_marketing",
    label: "نظرة عامة · التسويق",
    description: "عرض مؤشرات التسويق في النظرة العامة.",
    group: "نظرة عامة",
  },
  /* ── 3. المدن ── */
  {
    key: "view_cities",
    label: "عرض المدن",
    description: "فتح دورة حياة المدن وسجل النطاقات التشغيلية.",
    group: "المدن",
  },
  {
    key: "create_city",
    label: "إنشاء مدينة",
    description: "إنشاء مدينة جديدة عبر معالج ذكاء الأعمال الجغرافي.",
    group: "المدن",
  },
  {
    key: "update_city_zone",
    label: "تحديث النطاق الجغرافي",
    description: "تعديل حدود المدينة ونطاقها التشغيلي وبياناتها الميدانية.",
    group: "المدن",
  },
  {
    key: "view_city_analytics",
    label: "عرض تحليلات المدينة",
    description: "الاطلاع على تقديرات السكان والتجار ومؤشر المنافسة داخل النطاق.",
    group: "المدن",
  },
  {
    key: "assign_city_managers",
    label: "إسناد مديري التشغيل",
    description: "تعيين أو إلغاء مديري التشغيل للمدينة وتوسيع نطاق مدنهم المتاحة.",
    group: "المدن",
  },
  {
    key: "manage_cities",
    label: "إدارة المدن",
    description: "تعديل حدود المدينة ونطاقها التشغيلي وإسناد مديريها.",
    group: "المدن",
  },
  {
    key: "view_active_cities",
    label: "عرض المدن النشطة",
    description: "فتح دورة حياة المدن النشطة وسجلاتها.",
    group: "المدن",
  },
  {
    key: "view_geo_operations",
    label: "عرض العمليات الجغرافية",
    description: "الاطلاع على تقديرات السكان والتجار ومؤشر المنافسة.",
    group: "المدن",
  },
  {
    key: "add_city",
    label: "إضافة مدينة",
    description: "إنشاء مدينة جديدة عبر معالج ذكاء الأعمال الجغرافي.",
    group: "المدن",
  },
  /* ── 4. التجار ── */
  {
    key: "create_merchants",
    label: "إضافة التجار",
    description: "إضافة سجلات تجار جديدة.",
    group: "التجار",
  },
  {
    key: "edit_merchants",
    label: "تعديل التجار",
    description: "تغيير ملف التاجر وبياناته التجارية.",
    group: "التجار",
  },
  {
    key: "delete_merchants",
    label: "حذف التجار",
    description: "أرشفة أو حذف سجلات التجار.",
    group: "التجار",
  },
  {
    key: "view_merchants",
    label: "عرض التجار",
    description: "فتح دليل التجار.",
    group: "التجار",
  },
  {
    key: "transfer_merchants",
    label: "نقل ملكية التجار",
    description: "نقل ملكية التاجر بين الفرق.",
    group: "التجار",
  },
  {
    key: "view_merchant_profile",
    label: "عرض وتعديل ملف التاجر",
    description: "الاطلاع على ملف التاجر وتحديث بياناته التجارية.",
    group: "التجار",
  },
  {
    key: "add_merchant",
    label: "إضافة تاجر",
    description: "إضافة سجلات تجار جديدة.",
    group: "التجار",
  },
  {
    key: "edit_merchant_socials",
    label: "تعديل عنوان وروابط التاجر",
    description: "تحديث العنوان الفعلي وروابط فيسبوك وإنستغرام والموقع.",
    group: "التجار",
  },
  {
    key: "toggle_app_publish",
    label: "نشر التاجر في التطبيق",
    description: "التحكم في ظهور التاجر ومنتجاته داخل تطبيق كانجو.",
    group: "التجار",
  },
  {
    key: "manage_vip_menu",
    label: "إدارة قائمة VIP",
    description: "إدراج التاجر تحت التعاقد أو عرض مبدئي دون اتفاق نهائي.",
    group: "التجار",
  },
  {
    key: "export_merchant_data",
    label: "تصدير بيانات التاجر",
    description: "فتح ملفات التاجر الرسمية وتصدير بياناته إلى Excel.",
    group: "التجار",
  },
  /* ── 5. الكتالوج ── */
  {
    key: "manage_catalog",
    label: "إدارة الكتالوج",
    description: "صلاحية شاملة لإدارة منتجات الكتالوج، تشمل الإضافة والتعديل والحذف.",
    group: "الكتالوج",
  },
  {
    key: "view_catalog",
    label: "عرض الكتالوج",
    description: "فتح كتالوج المنتجات.",
    group: "الكتالوج",
  },
  {
    key: "create_products",
    label: "إضافة المنتجات",
    description: "إضافة منتجات إلى الكتالوج.",
    group: "الكتالوج",
  },
  {
    key: "edit_catalog",
    label: "تعديل الكتالوج",
    description: "تعديل المنتجات وحذفها من الكتالوج.",
    group: "الكتالوج",
  },
  {
    key: "add_catalog",
    label: "إضافة إلى الكتالوج",
    description: "إضافة منتجات جديدة إلى الكتالوج.",
    group: "الكتالوج",
  },
  {
    key: "review_catalog_images",
    label: "مراجعة وتعديل صور الكتالوج",
    description: "مراجعة صور المنتجات المعلّقة، تحسينها واعتمادها قبل النشر في الكتالوج.",
    group: "الكتالوج",
  },
  {
    key: "delete_products",
    label: "حذف المنتجات",
    description: "إزالة المنتجات من الكتالوج.",
    group: "الكتالوج",
  },
  {
    key: "view_taxonomy",
    label: "عرض التصنيف المركزي",
    description: "الاطلاع على أنواع التجار والتصنيفات والمتغيرات المرتبطة بمعرّفات لوحة المستهلك.",
    group: "الكتالوج",
  },
  {
    key: "request_taxonomy",
    label: "طلب إضافة تصنيف",
    description: "إرسال طلب إضافة نوع تاجر أو تصنيف أو متغير إلى قائمة المراجعة المركزية.",
    group: "الكتالوج",
  },
  /* ── 6. مراجعة الصور ── */
  {
    key: "edit_product_images",
    label: "تعديل صور المنتجات",
    description: "تحسين صور المنتجات ورفع نسخ بديلة.",
    group: "مراجعة الصور",
  },
  {
    key: "review_image_quality",
    label: "مراجعة جودة الصور",
    description: "اعتماد صور المنتجات أو رفضها قبل النشر.",
    group: "مراجعة الصور",
  },
  /* ── 7. التصنيفات ── */
  {
    key: "review_add_requests",
    label: "مراجعة طلبات الإضافة",
    description: "مراجعة طلبات إضافة تصنيفات جديدة واعتمادها.",
    group: "التصنيفات",
  },
  {
    key: "manage_merchant_types",
    label: "إدارة أنواع التجار",
    description: "إضافة وتعديل أنواع التجار المرتبطة بمعرّفات لوحة المستهلك.",
    group: "التصنيفات",
  },
  {
    key: "manage_categories",
    label: "إدارة التصنيفات",
    description: "إدارة التصنيف المركزي للكتالوج.",
    group: "التصنيفات",
  },
  {
    key: "manage_variables",
    label: "إدارة المتغيرات",
    description: "إدارة المتغيرات المرتبطة بالتصنيفات.",
    group: "التصنيفات",
  },
  /* ── 8. الحوكمة ── */
  {
    key: "manage_taxonomy",
    label: "إدارة التصنيف المركزي",
    description: "اعتماد طلبات التصنيف وربطها بمعرّفات لوحة المستهلك الرسمية.",
    group: "الحوكمة",
  },
  {
    key: "manage_permissions",
    label: "إدارة الصلاحيات",
    description: "فتح مصفوفة الصلاحيات ومنح القدرات أو سحبها.",
    group: "الحوكمة",
  },
  /* ── 9. العمليات الميدانية ── */
  {
    key: "view_field_ops",
    label: "عرض العمليات الميدانية",
    description: "فتح لوحة العمليات الميدانية ومسار الزيارات.",
    group: "العمليات الميدانية",
  },
  {
    key: "view_agent_kpi",
    label: "عرض لوحة مؤشرات المناديب",
    description: "فتح لوحة مؤشرات الأداء الأربع مراحل وتصفية المناديب والفرق والمدن.",
    group: "العمليات الميدانية",
  },
  {
    key: "manage_tasks",
    label: "إدارة المهام",
    description: "إدارة المهام الميدانية ومراجعة لوحة التشغيل.",
    group: "العمليات الميدانية",
  },
  {
    key: "approve_tasks",
    label: "اعتماد المهام",
    description: "اعتماد العمل الميداني المكتمل.",
    group: "العمليات الميدانية",
  },
  {
    key: "assign_tasks",
    label: "إسناد المهام",
    description: "إنشاء المهام الميدانية وإسنادها للمناديب.",
    group: "العمليات الميدانية",
  },
  {
    key: "request_transfers",
    label: "طلب نقل التجار",
    description: "طلب نقل تاجر إلى فريق المندوب.",
    group: "العمليات الميدانية",
  },
  {
    key: "view_all_teams_visits",
    label: "عرض زيارات كل الفرق",
    description: "الاطلاع على زيارات وتقارير كل الفرق الميدانية.",
    group: "العمليات الميدانية",
  },
  {
    key: "approve_transfers",
    label: "اعتماد النقل",
    description: "اعتماد أو رفض طلبات نقل التجار بين الفرق.",
    group: "العمليات الميدانية",
  },
  {
    key: "start_end_visit",
    label: "بدء وإنهاء الزيارات",
    description: "بدء الزيارة الميدانية وإنهاؤها وتسجيل مدتها.",
    group: "العمليات الميدانية",
  },
  {
    key: "approve_edit_requests",
    label: "اعتماد تعديل التقارير",
    description: "اعتماد أو رفض طلبات تعديل تقارير الزيارات المقفلة.",
    group: "العمليات الميدانية",
  },
  {
    key: "write_report",
    label: "كتابة التقارير",
    description: "كتابة تقارير الزيارات وإرسالها للاعتماد.",
    group: "العمليات الميدانية",
  },
  {
    key: "manage_merchant_state",
    label: "إدارة حالة التاجر",
    description: "تجاوز حالات الاتفاق النهائي والتوقيع وتعديل السجلات المقفلة.",
    group: "العمليات الميدانية",
  },
  {
    key: "request_ownership_transfer",
    label: "طلب نقل الملكية",
    description: "طلب نقل ملكية تاجر بين الفرق.",
    group: "العمليات الميدانية",
  },
  {
    key: "approve_ownership_transfer",
    label: "اعتماد نقل الملكية",
    description: "اعتماد طلبات نقل ملكية التجار بين الفرق.",
    group: "العمليات الميدانية",
  },
  {
    key: "approve_report_edits",
    label: "اعتماد تعديلات التقارير",
    description: "اعتماد طلبات تعديل التقارير المقفلة.",
    group: "العمليات الميدانية",
  },
  /* ── 10. مؤشرات المناديب ── */
  {
    key: "view_global_kpi",
    label: "عرض مؤشرات كل المناديب",
    description: "فتح مؤشرات مناديب كل المدن مع التصفية.",
    group: "مؤشرات المناديب",
  },
  {
    key: "view_rep_kpi",
    label: "عرض مؤشرات المندوب",
    description: "عرض مؤشرات المندوب الخاصة فقط.",
    group: "مؤشرات المناديب",
  },
  /* ── 11. العقود ── */
  {
    key: "view_contracts",
    label: "عرض العقود",
    description: "فتح سجل العقود.",
    group: "العقود",
  },
  {
    key: "create_contracts",
    label: "إنشاء العقود",
    description: "صياغة عقود تجار جديدة.",
    group: "العقود",
  },
  {
    key: "draft_contract",
    label: "صياغة العقود",
    description: "صياغة عقود تجار جديدة.",
    group: "العقود",
  },
  {
    key: "edit_contracts",
    label: "تعديل العقود",
    description: "تحديث شروط العقود وبياناتها الوصفية.",
    group: "العقود",
  },
  {
    key: "edit_contract",
    label: "تعديل العقود",
    description: "تحديث شروط العقود وبياناتها الوصفية.",
    group: "العقود",
  },
  {
    key: "sign_contracts",
    label: "توقيع العقود",
    description: "تطبيق التوقيع المعتمد على العقد.",
    group: "العقود",
  },
  {
    key: "delete_contracts",
    label: "حذف العقود",
    description: "إلغاء أو حذف سجلات العقود.",
    group: "العقود",
  },
  {
    key: "sign_contract",
    label: "توقيع العقود",
    description: "تطبيق التوقيع المعتمد على العقد.",
    group: "العقود",
  },
  {
    key: "cancel_contract",
    label: "إلغاء العقود",
    description: "إلغاء سجلات العقود وأرشفتها.",
    group: "العقود",
  },
  {
    key: "edit_finalized_contracts",
    label: "تحرير العقود المنتهية",
    description: "تجاوز قفل العقود الموقّعة أو الملغاة وتحرير مسودتها بالكامل.",
    group: "العقود",
  },
  /* ── 12. الحسابات البنكية ── */
  {
    key: "view_bank_balances",
    label: "عرض الأرصدة البنكية",
    description: "الاطلاع على أرصدة الحسابات البنكية.",
    group: "الحسابات البنكية",
  },
  {
    key: "add_bank_account",
    label: "إضافة حساب بنكي",
    description: "إضافة حسابات بنكية جديدة.",
    group: "الحسابات البنكية",
  },
  {
    key: "view_bank_transactions",
    label: "عرض حركات الحسابات",
    description: "الاطلاع على حركات الودائع والمصروفات.",
    group: "الحسابات البنكية",
  },
  {
    key: "record_bank_transaction",
    label: "تسجيل حركة بنكية",
    description: "تسجيل الودائع والمصروفات على الحسابات البنكية.",
    group: "الحسابات البنكية",
  },
  /* ── 13. المالية ── */
  {
    key: "view_financials",
    label: "عرض البيانات المالية",
    description: "الاطلاع على الإيرادات والعمولات والمصروفات في مركز القيادة التنفيذي.",
    group: "المالية",
  },
  {
    key: "manage_expenses",
    label: "إدارة المصروفات",
    description: "تسجيل مصروفات التشغيل واعتمادها في دفتر المالية.",
    group: "المالية",
  },
  {
    key: "view_accounts",
    label: "عرض الحسابات البنكية",
    description: "الاطلاع على الحسابات البنكية وأرصدة الودائع والمصروفات.",
    group: "المالية",
  },
  {
    key: "manage_accounts",
    label: "إدارة الحسابات البنكية",
    description: "إضافة الحسابات البنكية وتسجيل الودائع والمصروفات.",
    group: "المالية",
  },
  {
    key: "record_deposits",
    label: "تسجيل الإيداعات",
    description: "تسجيل إيداعات الحسابات البنكية المصرية فقط، دون الاطلاع على الأرصدة أو المصروفات.",
    group: "المالية",
  },
  {
    key: "view_payroll",
    label: "عرض الرواتب والعمولات",
    description: "الاطلاع على مسير الرواتب وحساب العمولات لكل مندوب.",
    group: "المالية",
  },
  {
    key: "manage_payroll",
    label: "إدارة الرواتب والعمولات",
    description: "تعديل بنود الرواتب والعمولات واعتماد المسير.",
    group: "المالية",
  },
  /* ── 14. التسويق ── */
  {
    key: "manage_marketing_metrics",
    label: "إدارة مؤشرات التسويق",
    description: "تحديث أرقام الوصول والحملات المستخدمة في لوحة التسويق.",
    group: "التسويق",
  },
  {
    key: "view_campaigns",
    label: "عرض الحملات",
    description: "الاطلاع على الحملات التسويقية ونتائجها.",
    group: "التسويق",
  },
  {
    key: "create_campaign",
    label: "إنشاء حملة",
    description: "إنشاء حملات تسويقية جديدة.",
    group: "التسويق",
  },
  {
    key: "record_campaign_results",
    label: "تسجيل نتائج الحملات",
    description: "تسجيل أرقام الوصول ونتائج الحملات.",
    group: "التسويق",
  },
  {
    key: "view_marketing_logs",
    label: "عرض سجلات التسويق",
    description: "الاطلاع على سجل عمليات التسويق.",
    group: "التسويق",
  },
  {
    key: "manage_platform_settings",
    label: "إدارة إعدادات المنصات",
    description: "تعديل إعدادات منصات الإعلان المربوطة.",
    group: "التسويق",
  },
  /* ── 15. الرواتب ── */
  {
    key: "view_payroll_sheets",
    label: "عرض مسير الرواتب",
    description: "الاطلاع على مسير الرواتب لكل المناديب.",
    group: "الرواتب",
  },
  {
    key: "view_employee_payslip",
    label: "عرض قسيمة الموظف",
    description: "عرض قسيمة راتب الموظف الخاصة.",
    group: "الرواتب",
  },
  /* ── 16. إدخال البيانات ── */
  {
    key: "view_pricing_and_status",
    label: "عرض الأسعار والحالات",
    description: "استعراض التجار والمنتجات وأسعارها وحالاتها.",
    group: "إدخال البيانات",
  },
  /* ── 17. أسعار العمولات ── */
  {
    key: "manage_commission_rates",
    label: "إدارة أسعار العمولات",
    description: "تعديل رسوم التفعيل والصور والتعاقد لكل مدينة.",
    group: "أسعار العمولات",
  },
  /* ── 18. مستخدمين النظام ── */
  {
    key: "manage_system_users",
    label: "إدارة مستخدمين النظام",
    description: "إنشاء المستخدمين وتعديل رتبهم وصلاحياتهم ونطاق مدنهم.",
    group: "مستخدمين النظام",
  },
  /* ── 19. المقاصة والعمليات ── */
  {
    key: "log_operations",
    label: "تسجيل العمليات",
    description: "تسجيل الطلبات المنفذة وطريقة التحصيل وحصة المندوب.",
    group: "المقاصة والعمليات",
  },
  {
    key: "view_clearinghouse",
    label: "عرض المقاصة",
    description: "الاطلاع على المستحقات والمديونيات للتجار والمناديب.",
    group: "المقاصة والعمليات",
  },
  {
    key: "settle_clearinghouse",
    label: "تسوية المقاصة",
    description: "اعتماد سداد أو تحصيل بند في المقاصة وإغلاقه.",
    group: "المقاصة والعمليات",
  },
  /* ── 20. طلبات التجار ── */
  {
    key: "manage_merchant_applications",
    label: "إدارة طلبات انضمام التجار",
    description: "مراجعة طلبات التجار الواردة من صفحة الانضمام العامة وتحديث حالتها.",
    group: "طلبات التجار",
  },
  /* ── 21. الحوكمة (سجل التدقيق) ── */
  {
    key: "view_audit_logs",
    label: "عرض سجل التدقيق",
    description: "الاطلاع على سجل التغييرات (الصندوق الأسود) لمن ولماذا عدّل أي سجل.",
    group: "الحوكمة",
  },
  /* ── 22. مساحة العمل (الإشعارات) ── */
  {
    key: "view_notifications",
    label: "عرض الإشعارات",
    description: "فتح صندوق إشعارات المشغّل وقراءة التنبيهات الموجهة إليه.",
    group: "مساحة العمل",
  },
  /* ── 23. العمليات الميدانية (التقارير المؤرشفة) ── */
  {
    key: "view_archived_reports",
    label: "عرض التقارير المؤرشفة",
    description: "الاطلاع على تقارير الزيارات التي أُزيلت من مسار المهمة مع سبب الأرشفة.",
    group: "العمليات الميدانية",
  },
  {
    key: "manage_archived_reports",
    label: "إدارة التقارير المؤرشفة",
    description: "أرشفة تقرير زيارة أو استعادته إلى مسار المهمة.",
    group: "العمليات الميدانية",
  },
  /* ── 24. التسويق (عملاء الحملات) ── */
  {
    key: "view_marketing_leads",
    label: "عرض عملاء الحملات",
    description: "الاطلاع على العملاء المحتملين الواردين من الحملات وصفحة الانضمام.",
    group: "التسويق",
  },
  {
    key: "manage_marketing_leads",
    label: "إدارة عملاء الحملات",
    description: "تحديث حالة العميل المحتمل وربطه بحملة وتسجيل الملاحظات.",
    group: "التسويق",
  },
] as const;
