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
  | "data-entry";

export type ModuleDefinition = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  permission: Permission;
  /**
   * Additional capabilities that also open the module. The treasury is the
   * first case: a full accountant (`view_accounts`) and a deposit-only city
   * manager (`record_deposits`) both need the same route, but for different
   * reasons, and the page narrows what each may see.
   */
  alsoGrantedBy?: readonly Permission[];
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
    permission: "view_overview",
    icon: "overview",
  },
  {
    href: "/cities",
    label: "المدن",
    shortLabel: "المدن",
    description: "دورة حياة المدن ومعلومات السوق والنطاقات التشغيلية.",
    permission: "view_cities",
    icon: "cities",
  },
  {
    href: "/merchants",
    label: "التجار",
    shortLabel: "التجار",
    description: "دليل التجار والملكية وإجراءات دورة الحياة.",
    permission: "view_merchants",
    icon: "merchants",
  },
  {
    href: "/catalog",
    label: "الكتالوج",
    shortLabel: "الكتالوج",
    description: "المنتجات والأسعار وحوكمة الكتالوج.",
    permission: "view_catalog",
    icon: "catalog",
  },
  {
    href: "/catalog/qa",
    label: "مراجعة صور الكتالوج",
    shortLabel: "جودة الصور",
    description:
      "اعتماد صور المنتجات أو رفع نسخة محسّنة قبل النشر في الكتالوج.",
    permission: "review_catalog_images",
    icon: "catalog",
  },
  {
    href: "/catalog/taxonomy",
    label: "تصنيفات الكتالوج",
    shortLabel: "التصنيفات",
    description:
      "التصنيف المركزي المرتبط بمعرّفات لوحة المستهلك وطلبات الإضافة.",
    permission: "manage_taxonomy",
    icon: "taxonomy",
  },
  {
    href: "/agent-kpi",
    label: "مؤشرات المناديب",
    shortLabel: "المؤشرات",
    description:
      "تقييم أداء المناديب وفق مرحلة دورة حياة المدينة والترتيب داخل المدينة.",
    permission: "view_agent_kpi",
    icon: "kpi",
  },
  {
    href: "/field-ops",
    label: "العمليات الميدانية",
    shortLabel: "الميدان",
    description: "الزيارات وإسناد المهام ومسار الاعتماد.",
    permission: "view_field_ops",
    icon: "field-ops",
  },
  {
    href: "/contracts",
    label: "العقود",
    shortLabel: "العقود",
    description: "سجل العقود والصياغة والتوقيع المعتمد.",
    permission: "view_contracts",
    icon: "contracts",
  },
  {
    href: "/accounts",
    label: "الحسابات البنكية",
    shortLabel: "الحسابات",
    description: "أرصدة الحسابات البنكية وحركات الودائع والمصروفات.",
    permission: "view_accounts",
    alsoGrantedBy: ["manage_accounts", "record_deposits"],
    icon: "accounts",
  },
  {
    href: "/payroll",
    label: "الرواتب والعمولات",
    shortLabel: "الرواتب",
    description: "مسير الرواتب وبدلات الانتقال وعمولات التعاقد المتدرجة.",
    permission: "view_payroll",
    icon: "payroll",
  },
  {
    href: "/marketing",
    label: "التسويق",
    shortLabel: "التسويق",
    description: "إدخال أرقام الحملات وإعدادات منصات الإعلان.",
    permission: "manage_marketing_metrics",
    icon: "marketing",
  },
  {
    href: "/data-entry",
    label: "إدخال البيانات",
    shortLabel: "الإدخال",
    description: "استعراض التجار أولاً ثم منتجات كل تاجر وأسعاره.",
    permission: "view_catalog",
    icon: "data-entry",
  },
  {
    href: "/admin/permissions",
    label: "الصلاحيات",
    shortLabel: "الصلاحيات",
    description: "منح القدرات الدقيقة وسحبها في الوقت الفعلي.",
    permission: "manage_permissions",
    icon: "permissions",
  },
];

export const PUBLIC_PATHS: readonly string[] = ["/login", "/forbidden"];

/** True when any capability the module accepts is held. */
export function moduleAllows(
  module: ModuleDefinition,
  permissions: readonly Permission[],
): boolean {
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
  if (pathname === "/") return "view_overview";
  return moduleForPath(pathname)?.permission ?? null;
}

/**
 * Every capability that opens a path, so the middleware can accept a session
 * holding any one of them instead of only the module's headline permission.
 */
export function permissionsForPath(pathname: string): Permission[] {
  if (pathname === "/") return ["view_overview"];
  const module = moduleForPath(pathname);
  if (!module) return [];
  return [module.permission, ...(module.alsoGrantedBy ?? [])];
}

export function firstPermittedPath(
  permissions: readonly Permission[],
): string {
  const first = MODULES.find((module) => moduleAllows(module, permissions));
  return first?.href ?? "/forbidden";
}
