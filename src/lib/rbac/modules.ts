import type { Permission } from "./permissions";

export type ModuleIcon =
  | "overview"
  | "kpi"
  | "cities"
  | "merchants"
  | "catalog"
  | "taxonomy"
  | "field-ops"
  | "contracts"
  | "permissions"
  | "accounts"
  | "payroll"
  | "marketing"
  | "finance"
  | "data-entry";

export type ModuleDefinition = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  permission: Permission;
  /**
   * Additional capabilities that also open the module. The treasury is the
   * first case: a full accountant (`view_bank_balances`) and a deposit-only city
   * manager (`record_bank_transaction`) both need the same route, but for different
   * reasons, and the page narrows what each may see.
   */
  alsoGrantedBy?: readonly Permission[];
  /**
   * Minimum clearance rank to even see the module. Commission rates are the
   * first case: the database gates the surface by `app.has_min_clearance(4)`,
   * not by a capability key, so the navigation must not advertise a route
   * whose page guard will refuse the visitor.
   */
  minClearance?: number;
  icon: ModuleIcon;
};

/**
 * Navigation modules are permission declarations, not role declarations.
 * The sidebar and middleware both derive their decisions from this list.
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
];

export const PUBLIC_PATHS: readonly string[] = ["/login", "/forbidden"];

/** True when any capability the module accepts is held, at a sufficient rank. */
export function moduleAllows(
  module: ModuleDefinition,
  permissions: readonly Permission[],
  clearanceLevel = 0,
): boolean {
  if (
    module.minClearance !== undefined &&
    clearanceLevel < module.minClearance
  ) {
    return false;
  }
  if (permissions.includes(module.permission)) return true;
  return (module.alsoGrantedBy ?? []).some((permission) =>
    permissions.includes(permission),
  );
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function moduleForPath(pathname: string): ModuleDefinition | null {
  const matches = MODULES.filter(
    (module) =>
      pathname === module.href || pathname.startsWith(`${module.href}/`),
  ).sort((left, right) => right.href.length - left.href.length);

  return matches[0] ?? null;
}

export function permissionForPath(pathname: string): Permission | null {
  if (pathname === "/") return "view_overview_contracts";
  return moduleForPath(pathname)?.permission ?? null;
}

/**
 * Every capability that opens a path, so the middleware can accept a session
 * holding any one of them instead of only the module's headline permission.
 */
export function permissionsForPath(pathname: string): Permission[] {
  if (pathname === "/") return ["view_overview_contracts"];
  const module = moduleForPath(pathname);
  if (!module) return [];
  return [module.permission, ...(module.alsoGrantedBy ?? [])];
}

export function firstPermittedPath(
  permissions: readonly Permission[],
  clearanceLevel = 0,
): string {
  const first = MODULES.find((module) =>
    moduleAllows(module, permissions, clearanceLevel),
  );
  return first?.href ?? "/forbidden";
}
