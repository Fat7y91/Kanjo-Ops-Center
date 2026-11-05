import type { Permission } from "./permissions";

import { MODULES } from "./module-catalog";

export { MODULES };

export type ModuleIcon =
  | "profile"
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
  | "operations"
  | "clearinghouse"
  | "notifications"
  | "audit"
  | "archive";

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
  /**
   * Clearance rank that also opens the module, alongside the capability. The
   * notification inbox is the first case: every operator is granted
   * `view_notifications`, but a deployment whose grant table runs behind the
   * code must not lock the executive tier out of its own inbox. The grant is
   * always checked first, so an explicit permission is never dropped.
   */
  clearanceBypass?: number;
  /**
   * Hides the module from the sidebar. The route, its guard and its API stay
   * reachable; the surface simply is not a primary navigation item. The inbox
   * follows the Facebook pattern — the topbar bell is the entry point, and the
   * module is reached from the bell's "عرض كل الإشعارات" footer link.
   */
  hiddenFromSidebar?: boolean;
  /**
   * Personal surfaces (the operator's own profile) are open to every signed-in
   * account. They carry no capability because nobody can be *granted* access
   * to their own record: the guard is the session itself.
   */
  sessionOnly?: boolean;
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
  // A personal surface opens for any signed-in operator. `moduleAllows` is only
  // reached with a live session, so no capability check applies.
  if (module.sessionOnly) return true;
  if (
    module.minClearance !== undefined &&
    clearanceLevel < module.minClearance
  ) {
    return false;
  }
  if (permissions.includes(module.permission)) return true;
  if (
    module.clearanceBypass !== undefined &&
    clearanceLevel >= module.clearanceBypass
  ) {
    return true;
  }
  return (module.alsoGrantedBy ?? []).some((permission) =>
    permissions.includes(permission),
  );
}

/**
 * Whether a module belongs in the sidebar.
 *
 * A hidden module is still routable and still guarded; it is simply not a
 * primary navigation item. The notification inbox uses this: the topbar bell is
 * its entry point, never a sidebar row.
 */
export function moduleInSidebar(module: ModuleDefinition): boolean {
  return module.hiddenFromSidebar !== true;
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
  // An empty list means "signed in is enough": the middleware then accepts any
  // valid session instead of demanding a capability nobody holds.
  if (!module || module.sessionOnly) return [];
  return [module.permission, ...(module.alsoGrantedBy ?? [])];
}

/**
 * Every capability that opens the module with this exact href.
 *
 * API controllers reuse this so their `authorizeAny` set matches the page and
 * the sidebar: a client that can open the screen can also load its data.
 */
export function permissionsForModule(href: string): Permission[] {
  const module = MODULES.find((candidate) => candidate.href === href);
  if (!module || module.sessionOnly) return [];
  return [module.permission, ...(module.alsoGrantedBy ?? [])];
}

export function firstPermittedPath(
  permissions: readonly Permission[],
  clearanceLevel = 0,
): string {
  // Hidden modules (the inbox) are never a landing page: the first permitted
  // *navigation* item wins, otherwise a fresh executive session would land on a
  // surface the sidebar does not even list.
  const first = MODULES.filter(moduleInSidebar).find((module) =>
    moduleAllows(module, permissions, clearanceLevel),
  );
  return first?.href ?? "/forbidden";
}
