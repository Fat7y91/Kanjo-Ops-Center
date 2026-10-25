import type { Permission } from "./permissions";

export type ModuleIcon =
  | "overview"
  | "cities"
  | "merchants"
  | "catalog"
  | "field-ops"
  | "contracts"
  | "permissions";

export type ModuleDefinition = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  permission: Permission;
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
    permission: "manage_cities",
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
    href: "/admin/permissions",
    label: "الصلاحيات",
    shortLabel: "الصلاحيات",
    description: "منح القدرات الدقيقة وسحبها في الوقت الفعلي.",
    permission: "manage_permissions",
    icon: "permissions",
  },
];

export const PUBLIC_PATHS: readonly string[] = ["/login", "/forbidden"];

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

export function firstPermittedPath(
  permissions: readonly Permission[],
): string {
  const first = MODULES.find((module) =>
    permissions.includes(module.permission),
  );
  return first?.href ?? "/forbidden";
}
