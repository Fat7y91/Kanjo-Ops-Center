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
