import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { TeamRow } from "@/lib/rbac/team-repository";
import { isMissingSchemaObject } from "@/lib/rbac/repository";
import type { ProvisionAccountInput } from "@/lib/schemas/provisioning";

import { ProvisioningError } from "./provisioning-errors";

/**
 * The three writes that make a provisioned account usable: profile, explicit
 * capability grants, and city scope. Split from the orchestrator so the
 * rollback story (`deleteUser` on any failure) stays readable in one place.
 */

export async function createAuthUser(
  client: SupabaseClient,
  input: ProvisionAccountInput,
): Promise<User> {
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
export async function attachProfile(
  client: SupabaseClient,
  userId: string,
  input: ProvisionAccountInput,
  team: TeamRow | null,
): Promise<void> {
  // `.select()` is deliberate: an UPDATE that matches no row succeeds with an
  // empty result, which would silently leave the profile blank. The auth
  // trigger is expected to have created the row already.
  const write = (allowTeamId: boolean) =>
    client
      .schema("app")
      .from("users")
      .update({
        full_name: input.fullName,
        title: input.title,
        ...(allowTeamId ? { team_id: team?.id ?? null } : {}),
        // `team` is the deprecated label, kept in sync for the legacy readers.
        team: team?.name ?? "",
        clearance_level: input.clearanceLevel,
      })
      .eq("id", userId)
      .select("id");

  let { data, error } = await write(true);

  // A deployment that predates the teams migration has no `team_id` column.
  // Dropping the column is acceptable for a non-team profile, but a courier
  // must never be provisioned without their team: fail loudly instead of
  // silently creating a rep who belongs to nobody.
  if (error && isMissingSchemaObject(error)) {
    if (team) {
      throw new ProvisioningError(
        "TEAM_STORE_UNAVAILABLE",
        "إدارة الفرق غير مُفعّلة على هذا النشر بعد.",
        503,
      );
    }
    ({ data, error } = await write(false));
  }

  if (error || !data || data.length === 0) {
    throw new ProvisioningError(
      "PROFILE_FAILED",
      "تعذر حفظ بيانات المشغّل.",
      502,
    );
  }
}

export async function attachGrants(
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

export async function attachCityScope(
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
