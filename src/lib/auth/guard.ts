import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
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
