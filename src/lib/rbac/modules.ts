import type { Permission } from "./permissions";

export type ModuleIcon =
  | "overview"
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
    label: "Overview",
    shortLabel: "Overview",
    description: "Enterprise health, operational signals, and finance.",
    permission: "view_overview",
    icon: "overview",
  },
  {
    href: "/merchants",
    label: "Merchants",
    shortLabel: "Merchants",
    description: "Merchant directory, ownership, and lifecycle actions.",
    permission: "view_merchants",
    icon: "merchants",
  },
  {
    href: "/catalog",
    label: "Catalog",
    shortLabel: "Catalog",
    description: "Products, pricing, and catalog governance.",
    permission: "view_catalog",
    icon: "catalog",
  },
  {
    href: "/field-ops",
    label: "Field Ops",
    shortLabel: "Field",
    description: "Visits, task assignment, and approval workflow.",
    permission: "view_field_ops",
    icon: "field-ops",
  },
  {
    href: "/contracts",
    label: "Contracts",
    shortLabel: "Contracts",
    description: "Contract register, drafting, and authorized signing.",
    permission: "view_contracts",
    icon: "contracts",
  },
  {
    href: "/admin/permissions",
    label: "Permissions",
    shortLabel: "Permissions",
    description: "Grant and revoke granular capabilities in real time.",
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
