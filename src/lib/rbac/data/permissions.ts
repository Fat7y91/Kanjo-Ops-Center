/**
 * Generated capability catalogue.
 *
 * Mirrors `app.permissions`. This file is data, not logic, and lives under
 * `data/` so it is exempt from the source-file line budget.
 */

export type PermissionDefinition = {
  key: string;
  label: string;
  description: string;
  group: string;
};

export const PERMISSIONS = [
  /* ── 1. Overview ──────────────────────────────────────────────────────── */
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

  /* ── 2. Cities ────────────────────────────────────────────────────────── */
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

  /* ── 3. Merchants ─────────────────────────────────────────────────────── */
  {
    key: "view_merchants",
    label: "عرض التجار",
    description: "فتح دليل التجار.",
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

  /* ── 4. Catalog ───────────────────────────────────────────────────────── */
  {
    key: "view_catalog",
    label: "عرض الكتالوج",
    description: "فتح كتالوج المنتجات.",
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

  /* ── 5. Images ────────────────────────────────────────────────────────── */
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

  /* ── 6. Categories ────────────────────────────────────────────────────── */
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

  /* ── 7. Rep KPIs ──────────────────────────────────────────────────────── */
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

  /* ── 8. Field Ops ─────────────────────────────────────────────────────── */
  {
    key: "assign_tasks",
    label: "إسناد المهام",
    description: "إنشاء المهام الميدانية وإسنادها للمناديب.",
    group: "العمليات الميدانية",
  },
  {
    key: "view_all_teams_visits",
    label: "عرض زيارات كل الفرق",
    description: "الاطلاع على زيارات وتقارير كل الفرق الميدانية.",
    group: "العمليات الميدانية",
  },
  {
    key: "start_end_visit",
    label: "بدء وإنهاء الزيارات",
    description: "بدء الزيارة الميدانية وإنهاؤها وتسجيل مدتها.",
    group: "العمليات الميدانية",
  },
  {
    key: "write_report",
    label: "كتابة التقارير",
    description: "كتابة تقارير الزيارات وإرسالها للاعتماد.",
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

  /* ── 9. Contracts ─────────────────────────────────────────────────────── */
  {
    key: "draft_contract",
    label: "صياغة العقود",
    description: "صياغة عقود تجار جديدة.",
    group: "العقود",
  },
  {
    key: "edit_contract",
    label: "تعديل العقود",
    description: "تحديث شروط العقود وبياناتها الوصفية.",
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

  /* ── 10. Banking ──────────────────────────────────────────────────────── */
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

  /* ── 11. Payroll ──────────────────────────────────────────────────────── */
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

  /* ── 12. Marketing ────────────────────────────────────────────────────── */
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

  /* ── 13. Data Entry ───────────────────────────────────────────────────── */
  {
    key: "view_pricing_and_status",
    label: "عرض الأسعار والحالات",
    description: "استعراض التجار والمنتجات وأسعارها وحالاتها.",
    group: "إدخال البيانات",
  },

  /* ── 14. Commission Rates ─────────────────────────────────────────────── */
  {
    key: "manage_commission_rates",
    label: "إدارة أسعار العمولات",
    description: "تعديل رسوم التفعيل والصور والتعاقد لكل مدينة.",
    group: "أسعار العمولات",
  },

  /* ── 15. Clearinghouse ────────────────────────────────────────────────── */
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

  /* ── 16. System Users ─────────────────────────────────────────────────── */
  {
    key: "manage_system_users",
    label: "إدارة مستخدمين النظام",
    description: "إنشاء المستخدمين وتعديل رتبهم وصلاحياتهم ونطاق مدنهم.",
    group: "مستخدمين النظام",
  },
] as const;
