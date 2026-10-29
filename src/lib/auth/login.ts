import { createSessionToken } from "@/lib/auth/session";
import { firstPermittedPath } from "@/lib/rbac/modules";
import { getRbacRevision, getUserById } from "@/lib/rbac/users";

export const LOGIN_ERROR_PATH = "/login?error=unknown-user";

/**
 * Rejects anything that is not a same-origin absolute path. Without this a
 * crafted `next` field could bounce the user to an external host.
 */
export function safeNextPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export type LoginOutcome =
  | { ok: true; token: string; redirectTo: string }
  | { ok: false; redirectTo: string };

/**
 * Tier 2 login resolution, shared by the Route Handler. It never calls
 * `redirect()`: on `next-on-pages` a Server Action redirect throws
 * `Invariant: Missing initURL`, so the caller turns this result into an
 * explicit `NextResponse.redirect`.
 */
export async function resolveLoginRequest(
  formData: FormData,
): Promise<LoginOutcome> {
  const userId = String(formData.get("userId") ?? "");
  const user = getUserById(userId);

  if (!user || !user.active) {
    return { ok: false, redirectTo: LOGIN_ERROR_PATH };
  }

  const token = await createSessionToken(
    user.id,
    user.permissions,
    getRbacRevision(),
  );

  return {
    ok: true,
    token,
    redirectTo:
      safeNextPath(formData.get("next")) ??
      firstPermittedPath(user.permissions),
  };
}
