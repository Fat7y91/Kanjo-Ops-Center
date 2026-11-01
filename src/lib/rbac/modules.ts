import type { Permission } from "./permissions";

import { MODULES } from "./module-catalog";

export { MODULES };

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
