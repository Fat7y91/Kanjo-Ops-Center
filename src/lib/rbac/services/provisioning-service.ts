import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { assertCanCreate } from "@/lib/rbac/management";
import type { Permission } from "@/lib/rbac/permissions";
import type { ActiveSession } from "@/lib/rbac/types";
import {
  provisionAccountSchema,
  type ProvisionAccountInput,
} from "@/lib/schemas/provisioning";

/**
 * Top-down provisioning. Kanjo has no public signup: an authorised operator
 * mints the auth account on the new joiner's behalf, then attaches the
 * capability grants and city scope.
 *
 * Every write below runs through the service-role client, so RLS is bypassed.
 * Authorization is therefore enforced here, in Tier 3, before any I/O —
 * `assertCanCreate` mirrors the same rules the SQL guards enforce.
 */

export type ProvisionedAccount = {
  id: string;
  phone: string;
  email: string | null;
  clearanceLevel: number;
  globalScope: boolean;
  permissions: Permission[];
  accessibleCities: string[];
};

export class ProvisioningError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ProvisioningError";
    this.code = code;
    this.status = status;
  }
}

/** Only real provisioned operators can be named as the grantor. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function grantorId(session: ActiveSession): string | null {
  return UUID_PATTERN.test(session.user.id) ? session.user.id : null;
}

export async function createUserAccount(
  session: ActiveSession,
  rawInput: unknown,
): Promise<ProvisionedAccount> {
  // Self-defending: the service-role client bypasses RLS, so authorization
  // must be re-asserted here even though the route already checked it.
  if (!session.permissions.includes("manage_permissions")) {
    throw new ProvisioningError(
      "PERMISSION_DENIED",
      "لا تملك صلاحية إنشاء الحسابات.",
      403,
    );
  }

  const input = provisionAccountSchema.parse(rawInput);
  assertCanCreate(session, input);
  return provision(input, grantorId(session));
}

async function provision(
  input: ProvisionAccountInput,
  grantedBy: string | null,
): Promise<ProvisionedAccount> {
  const client = getSupabaseServerClient();

  const authUser = await createAuthUser(client, input);

  try {
    await attachProfile(client, authUser.id, input);
    await attachGrants(client, authUser.id, input, grantedBy);
    await attachCityScope(client, authUser.id, input, grantedBy);
  } catch (error) {
    // Deleting the auth user cascades app.users, user_permissions and
    // user_city_scope, so a half-provisioned account cannot survive.
    await client.auth.admin.deleteUser(authUser.id).catch(() => undefined);
    throw error;
  }

  return {
    id: authUser.id,
    phone: input.phone,
    email: input.email ?? null,
    clearanceLevel: input.clearanceLevel,
    globalScope: input.clearanceLevel >= 3,
    permissions: [...input.permissions],
    accessibleCities: [...input.accessibleCities],
  };
}

async function createAuthUser(
  client: SupabaseClient,
  input: ProvisionAccountInput,
) {
  const { data, error } = await client.auth.admin.createUser({
    phone: input.phone,
    password: input.password,
    email: input.email,
    phone_confirm: true,
    email_confirm: Boolean(input.email),
    user_metadata: { full_name: input.fullName },
  });

  if (error || !data.user) {
    if (error?.code === "phone_exists" || error?.status === 422) {
      throw new ProvisioningError(
        "PHONE_TAKEN",
        "يوجد حساب مسجّل بهذا الرقم بالفعل.",
        409,
      );
    }
    throw new ProvisioningError(
      "AUTH_CREATE_FAILED",
      "تعذر إنشاء حساب الدخول.",
      502,
    );
  }

  return data.user;
}

/** The auth trigger mirrors phone/email; everything else is profile detail. */
async function attachProfile(
  client: SupabaseClient,
  userId: string,
  input: ProvisionAccountInput,
): Promise<void> {
  // `.select()` is deliberate: an UPDATE that matches no row succeeds with an
  // empty result, which would silently leave the profile blank. The auth
  // trigger is expected to have created the row already.
  const { data, error } = await client
    .schema("app")
    .from("users")
    .update({
      full_name: input.fullName,
      title: input.title,
      team: input.team ?? "",
      clearance_level: input.clearanceLevel,
    })
    .eq("id", userId)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new ProvisioningError(
      "PROFILE_FAILED",
      "تعذر حفظ بيانات المشغّل.",
      502,
    );
  }
}

async function attachGrants(
  client: SupabaseClient,
  userId: string,
  input: ProvisionAccountInput,
  grantedBy: string | null,
): Promise<void> {
  if (input.permissions.length === 0) return;

  const rows = input.permissions.map((permissionKey) => ({
    user_id: userId,
    permission_key: permissionKey,
    granted_by: grantedBy,
  }));

  const { error } = await client
    .schema("app")
    .from("user_permissions")
    .insert(rows);

  if (error) {
    throw new ProvisioningError(
      "GRANT_FAILED",
      "تعذر منح صلاحيات المشغّل.",
      502,
    );
  }
}

async function attachCityScope(
  client: SupabaseClient,
  userId: string,
  input: ProvisionAccountInput,
  grantedBy: string | null,
): Promise<void> {
  if (input.accessibleCities.length === 0) return;

  const rows = Array.from(new Set(input.accessibleCities)).map((cityId) => ({
    user_id: userId,
    city_id: cityId,
    granted_by: grantedBy,
  }));

  const { error } = await client
    .schema("app")
    .from("user_city_scope")
    .insert(rows);

  if (error) {
    throw new ProvisioningError(
      "SCOPE_FAILED",
      "تعذر تحديد نطاق مدن المشغّل.",
      502,
    );
  }
}
