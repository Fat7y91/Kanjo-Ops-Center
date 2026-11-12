import type { ModuleDefinition } from "./modules";

/**
 * Navigation catalogue, first half: workspace navigation through marketing
 * leads, ending just before the finance and administration modules.
 *
 * Data only. `module-catalog.ts` concatenates this with the finance half and
 * `modules.ts` owns the lookup rules.
 */
export const CORE_MODULES: readonly ModuleDefinition[] = [
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
    // The inbox is a personal operating surface: a broadcast (owner-less)
    // notification reaches every active operator, a targeted one only its
    // recipient. The page narrows to the signed-in account's own rows.
    //
    // It is deliberately not a sidebar row: notifications never occupy a
    // primary navigation item. The topbar bell is the entry point, and its
    // "عرض كل الإشعارات" footer links here. The executive tier also reaches it
    // by rank, so a deployment whose grants run behind the code cannot lock an
    // L3+ operator out of their own inbox.
    href: "/notifications",
    label: "الإشعارات",
    shortLabel: "الإشعارات",
    description: "التنبيهات الموجهة إليك وإعلانات الإدارة العامة.",
    permission: "view_notifications",
    clearanceBypass: 3,
    hiddenFromSidebar: true,
    icon: "notifications",
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
    alsoGrantedBy: ["view_merchant_profile", "add_merchant", "import_merchants"],
    icon: "merchants",
  },
  {
    // The intake queue sits beside the directory but has its own capability:
    // an operator who reviews applications is not necessarily allowed to edit
    // the merchant book, and vice versa.
    href: "/merchants/applications",
    label: "طلبات انضمام التجار",
    shortLabel: "الطلبات",
    description: "الطلبات الواردة من صفحة الانضمام العامة والتواصل مع مقدّميها.",
    permission: "manage_merchant_applications",
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
    // Removed visit reports leave the field-ops queue but are not destroyed:
    // they move here with the reason and the operator who archived them. The
    // capability is separate so a reviewer can read the archive without the
    // power to remove or restore anything.
    href: "/field-ops/archived",
    label: "التقارير المؤرشفة",
    shortLabel: "الأرشيف",
    description: "تقارير الزيارات المُزالة من مسار المهمة وسبب الأرشفة.",
    permission: "view_archived_reports",
    alsoGrantedBy: ["manage_archived_reports"],
    icon: "archive",
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
    // Inbound leads arrive from the public spinwheel/landing surface. They are
    // not campaign performance numbers: the marketing desk triages them into
    // follow-ups, so they get their own capability and their own queue.
    href: "/marketing/leads",
    label: "عملاء الحملات",
    shortLabel: "العملاء",
    description:
      "العملاء المحتملون الواردون من الحملات وصفحة الانضمام وربطهم بالمتابعة.",
    permission: "view_marketing_leads",
    alsoGrantedBy: ["manage_marketing_leads", "view_campaigns"],
    icon: "marketing",
  },
];
