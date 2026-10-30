import { createClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/db/supabase/config";
import { createSessionToken } from "@/lib/auth/session";
import { firstPermittedPath } from "@/lib/rbac/modules";
import { getRbacRevision, getUserById } from "@/lib/rbac/users";

export const LOGIN_ERROR_PATH = "/login?error=invalid-credentials";
export const LOGIN_DISABLED_PATH = "/login?error=login-disabled";

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

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Verifies phone + password against Supabase Auth, then mints the app session
 * from the `app` schema profile.
 *
 * Password verification is delegated entirely to Supabase: the anon client
 * calls `signInWithPassword`, so Kanjo never sees or stores a hash. A
 * successful Supabase session proves the credential; the authorization data
 * still comes from `app.users`, so a valid credential with no profile row (or
 * a deactivated one) is refused.
 */
export async function resolveLoginRequest(
  formData: FormData,
): Promise<LoginOutcome> {
  // Login needs the public anon key to verify a password, and the service-role
  // key to read the profile back. Require both up front: with only the anon key
  // the profile read would silently fall back to the seed roster and every
  // correct password would still fail, which looks like a wrong password.
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { ok: false, redirectTo: LOGIN_DISABLED_PATH };
  }

  const phone = readField(formData, "phone");
  const password = String(formData.get("password") ?? "");

  if (!phone || !password) {
    return { ok: false, redirectTo: LOGIN_ERROR_PATH };
  }

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    phone,
    password,
  });

  if (error || !data.user) {
    return { ok: false, redirectTo: LOGIN_ERROR_PATH };
  }

  const user = await getUserById(data.user.id);
  if (!user || !user.active) {
    return { ok: false, redirectTo: LOGIN_ERROR_PATH };
  }

  const token = await createSessionToken(
    user.id,
    user.permissions,
    await getRbacRevision(),
  );

  return {
    ok: true,
    token,
    redirectTo:
      safeNextPath(formData.get("next")) ?? firstPermittedPath(user.permissions),
  };
}
