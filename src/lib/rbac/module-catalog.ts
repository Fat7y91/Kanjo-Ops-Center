import type { ModuleDefinition } from "./modules";

/**
 * Navigation catalogue.
 *
 * Data only: `modules.ts` owns the lookup rules, this file owns the list. Split
 * so the rule module stays small enough to read end to end as authorization
 * code rather than scrolling through descriptions.
 */
export const MODULES: readonly ModuleDefinition[] = [
  {
    href: "/overview",
    label: "النظرة العامة",
    shortLabel: "عام",
    description: "صحة المؤسسة والإشارات التشغيلية والمالية.",
    permission: "view_overview_contracts",
    alsoGrantedBy: [
      "view_overview_negotiation",
      "view_overview_finance",
      "view_overview_catalog",
      "view_overview_compliance",
      "view_overview_marketing",
    ],
    icon: "overview",
  },
  {
    href: "/cities",
    label: "المدن",
    shortLabel: "المدن",
    description: "دورة حياة المدن ومعلومات السوق والنطاقات التشغيلية.",
    permission: "view_active_cities",
    alsoGrantedBy: ["manage_cities", "view_geo_operations", "add_city"],
    icon: "cities",
  },
  {
    href: "/merchants",
    label: "التجار",
    shortLabel: "التجار",
    description: "دليل التجار والملكية وإجراءات دورة الحياة.",
    permission: "view_merchants",
    alsoGrantedBy: ["view_merchant_profile", "add_merchant"],
    icon: "merchants",
  },
  {
    href: "/catalog",
    label: "الكتالوج",
    shortLabel: "الكتالوج",
    description: "المنتجات والأسعار وحوكمة الكتالوج.",
    permission: "view_catalog",
    alsoGrantedBy: ["edit_catalog", "add_catalog"],
    icon: "catalog",
  },
  {
    href: "/catalog/qa",
    label: "مراجعة صور الكتالوج",
    shortLabel: "جودة الصور",
    description:
      "اعتماد صور المنتجات أو رفع نسخة محسّنة قبل النشر في الكتالوج.",
    permission: "review_image_quality",
    alsoGrantedBy: ["edit_product_images"],
    icon: "catalog",
  },
  {
    href: "/catalog/taxonomy",
    label: "تصنيفات الكتالوج",
    shortLabel: "التصنيفات",
    description:
      "التصنيف المركزي المرتبط بمعرّفات لوحة المستهلك وطلبات الإضافة.",
    permission: "manage_categories",
    alsoGrantedBy: [
      "review_add_requests",
      "manage_merchant_types",
      "manage_variables",
    ],
    icon: "taxonomy",
  },
  {
    href: "/agent-kpi",
    label: "مؤشرات المناديب",
    shortLabel: "المؤشرات",
    description:
      "تقييم أداء المناديب وفق مرحلة دورة حياة المدينة والترتيب داخل المدينة.",
    permission: "view_global_kpi",
    alsoGrantedBy: ["view_rep_kpi"],
    icon: "kpi",
  },
  {
    href: "/field-ops",
    label: "العمليات الميدانية",
    shortLabel: "الميدان",
    description: "الزيارات وإسناد المهام ومسار الاعتماد.",
    permission: "view_all_teams_visits",
    alsoGrantedBy: [
      "assign_tasks",
      "start_end_visit",
      "write_report",
      "request_ownership_transfer",
      "approve_ownership_transfer",
      "approve_report_edits",
    ],
    icon: "field-ops",
  },
  {
    href: "/contracts",
    label: "العقود",
    shortLabel: "العقود",
    description: "سجل العقود والصياغة والتوقيع المعتمد.",
    permission: "draft_contract",
    alsoGrantedBy: ["edit_contract", "sign_contract", "cancel_contract"],
    icon: "contracts",
  },
  {
    href: "/accounts",
    label: "الحسابات البنكية",
    shortLabel: "الحسابات",
    description: "أرصدة الحسابات البنكية وحركات الودائع والمصروفات.",
    permission: "view_bank_balances",
    alsoGrantedBy: [
      "add_bank_account",
      "view_bank_transactions",
      "record_bank_transaction",
    ],
    icon: "accounts",
  },
  {
    href: "/payroll",
    label: "الرواتب والعمولات",
    shortLabel: "الرواتب",
    description: "مسير الرواتب وبدلات الانتقال وعمولات التعاقد المتدرجة.",
    permission: "view_payroll_sheets",
    alsoGrantedBy: ["view_employee_payslip"],
    icon: "payroll",
  },
  {
    href: "/marketing",
    label: "التسويق",
    shortLabel: "التسويق",
    description: "إدخال أرقام الحملات وإعدادات منصات الإعلان.",
    permission: "view_campaigns",
    alsoGrantedBy: [
      "create_campaign",
      "record_campaign_results",
      "view_marketing_logs",
      "manage_platform_settings",
    ],
    icon: "marketing",
  },
  {
    href: "/data-entry",
    label: "إدخال البيانات",
    shortLabel: "الإدخال",
    description: "استعراض التجار أولاً ثم منتجات كل تاجر وأسعاره.",
    permission: "view_pricing_and_status",
    alsoGrantedBy: ["view_catalog"],
    icon: "data-entry",
  },
  {
    href: "/admin/finance/reviews",
    label: "اعتماد رأس المال",
    shortLabel: "الاعتمادات",
    description:
      "مراجعة إيداعات المؤسسين الرأسمالية ووجهات الصرف واعتمادها في الخزينة.",
    permission: "view_bank_balances",
    alsoGrantedBy: ["add_bank_account"],
    icon: "finance",
  },
  {
    href: "/admin/finance/rates",
    label: "أسعار العمولات",
    shortLabel: "العمولات",
    description:
      "رسوم تفعيل التاجر ورسم الصور والرسم الأساسي للتعاقد، بجدول افتراضي عام وتجاوزات لكل مدينة.",
    permission: "manage_commission_rates",
    minClearance: 4,
    icon: "finance",
  },
  {
    href: "/admin/permissions",
    label: "مستخدمين النظام",
    shortLabel: "المستخدمون",
    description: "إنشاء المستخدمين وإدارة رتبهم وصلاحياتهم ونطاق مدنهم.",
    permission: "manage_system_users",
    icon: "permissions",
  },
  {
    // Last on purpose: `firstPermittedPath` lands a fresh session on the first
    // permitted module, and the landing page should stay the overview.
    href: "/profile",
    label: "ملفي الشخصي",
    shortLabel: "ملفي",
    description: "بياناتي وكلمة المرور ووجهة الصرف ورأس مالي.",
    permission: "view_overview_contracts",
    sessionOnly: true,
    icon: "profile",
  },
];
