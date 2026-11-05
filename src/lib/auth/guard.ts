import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { moduleForPath, permissionsForPath } from "@/lib/rbac/modules";
import type { Permission } from "@/lib/rbac/permissions";
import type { ActiveSession } from "@/lib/rbac/types";

export async function requireSession(): Promise<ActiveSession> {
  const session = await getServerSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Server-side capability guard for pages and layouts. This is intentionally
 * independent of middleware so a stale cookie cannot bypass a revoked grant.
 */
export async function requirePermission(
  permission: Permission,
): Promise<ActiveSession> {
  const session = await requireSession();
  if (!session.permissions.includes(permission)) {
    redirect(`/forbidden?permission=${encodeURIComponent(permission)}`);
  }
  return session;
}

/**
 * Clearance guard for surfaces the database gates by rank rather than by a
 * capability key. `app.commission_rates` is such a surface: its SQL policies
 * require `app.has_min_clearance(4)`. This mirrors that rank check in the
 * application so the UI and the database cannot disagree about who may open
 * the surface.
 */
export async function requireMinClearance(
  level: number,
): Promise<ActiveSession> {
  const session = await requireSession();
  if (session.clearanceLevel < level) {
    redirect(`/forbidden?clearance=${encodeURIComponent(String(level))}`);
  }
  return session;
}

/**
 * Guard for a surface that several distinct grants can open (for example the
 * treasury, where a deposit-only city manager and a full accountant both have
 * a legitimate reason to be there).
 */
export async function requireAnyPermission(
  permissions: readonly Permission[],
): Promise<ActiveSession> {
  const session = await requireSession();
  if (!permissions.some((permission) => session.permissions.includes(permission))) {
    redirect(`/forbidden?permission=${encodeURIComponent(permissions[0])}`);
  }
  return session;
}

/**
 * Page guard derived from the navigation catalogue.
 *
 * The sidebar and middleware already decide access with
 * `permissionsForPath`, so a page that hard-codes a narrower key can bounce a
 * visitor who saw the nav entry and passed the middleware — the
 * "visible but forbidden" bug. Reading the same catalogue here keeps the page
 * in lockstep with the nav: if an operator can see the module, they can open
 * it, and each restricted subsection then unmounts itself on its own grant.
 *
 * An empty permission list means "signed in is enough" (personal surfaces such
 * as `/profile`), mirroring the middleware's session-only rule.
 */
export async function requireModuleAccess(
  pathname: string,
): Promise<ActiveSession> {
  const module = moduleForPath(pathname);
  if (module?.minClearance !== undefined) {
    await requireMinClearance(module.minClearance);
  }

  const session = await requireSession();
  // A module may also open by rank (the notification inbox does). The bypass is
  // checked after the capability set, so a held grant is never overridden.
  if (
    module?.clearanceBypass !== undefined &&
    session.clearanceLevel >= module.clearanceBypass
  ) {
    return session;
  }

  const accepted = permissionsForPath(pathname);
  // Empty means unmapped or session-only (`/profile`): signed in is enough.
  if (accepted.length === 0) return session;
  if (
    !accepted.some((permission) => session.permissions.includes(permission))
  ) {
    redirect(`/forbidden?permission=${encodeURIComponent(accepted[0])}`);
  }
  return session;
}
