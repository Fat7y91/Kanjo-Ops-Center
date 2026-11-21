import type { Permission } from "./permissions";

/**
 * Parent → children map for capabilities that are edited as a unit.
 *
 * `view_overview` unlocks the enterprise overview as a whole, while the
 * `view_overview_*` keys scope which sections inside it render. Revoking the
 * parent must therefore drop the section grants too, otherwise the operator
 * keeps section access without the surface that contains them.
 *
 * This is a UI-side convenience over the existing PATCH contract: the server
 * still validates every resulting grant with the same subset rule.
 */
export const PERMISSION_CHILDREN: Partial<
  Record<Permission, readonly Permission[]>
> = {
  view_overview: [
    "view_overview_contracts",
    "view_overview_negotiation",
    "view_overview_finance",
    "view_overview_catalog",
    "view_overview_compliance",
    "view_overview_marketing",
  ],
};

export function childPermissions(
  permission: Permission,
): readonly Permission[] {
  return PERMISSION_CHILDREN[permission] ?? [];
}

/** Parent capability that gates `permission`, or `null` for a root key. */
export function parentPermission(permission: Permission): Permission | null {
  for (const [parent, children] of Object.entries(PERMISSION_CHILDREN)) {
    if (children?.includes(permission)) return parent as Permission;
  }
  return null;
}

/**
 * Child keys that a revoke of `parent` must also drop, or `null` when nothing
 * cascades.
 *
 * A `null` result lets the caller keep the single-key PATCH path; only a real
 * cascade (the overview master dropping held sections) needs the multi-key
 * write.
 */
export function cascadeRevoke(
  held: readonly Permission[],
  parent: Permission,
): Permission[] | null {
  const children = childPermissions(parent).filter((child) => held.includes(child));
  return children.length > 0 ? [...children] : null;
}
