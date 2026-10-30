import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PERMISSION_KEYS } from "@/lib/rbac/permissions";

/**
 * One-shot Founder bootstrap. Exists because the only way to create a working
 * account is through Supabase's Admin API: a raw `auth.users` INSERT skips
 * GoTrue's bcrypt hashing and the `auth.identities` row, producing an account
 * that exists but can never authenticate.
 *
 * The password is supplied by the caller (read from the environment) and is
 * deliberately never stored in this repository.
 */

export type BootstrapResult = {
  id: string;
  phone: string;
  clearanceLevel: number;
  globalScope: boolean;
  permissionsGranted: number;
};

export class BootstrapError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
    this.status = status;
  }
}

const FULL_NAME = "المؤسس";
const CLEARANCE_LEVEL = 4;

export async function bootstrapFounder(
  client: SupabaseClient,
  phone: string,
  password: string,
): Promise<BootstrapResult> {
  const userId = await ensureAuthUser(client, phone, password);
  await attachProfile(client, userId, phone);
  const permissionsGranted = await grantAllPermissions(client, userId);

  return {
    id: userId,
    phone,
    clearanceLevel: CLEARANCE_LEVEL,
    globalScope: CLEARANCE_LEVEL >= 3,
    permissionsGranted,
  };
}

/**
 * True when a governor other than `targetPhone` is already active. Bootstrap
 * must not mint a second all-powerful account, but it stays usable to repair
 * the founder itself when a half-provisioned row exists.
 */
export async function hasOtherActiveGovernor(
  client: SupabaseClient,
  targetPhone: string,
): Promise<boolean> {
  // Plain queries rather than a PostgREST embed: app.user_permissions has two
  // FKs into app.users (user_id, granted_by), which makes embeds ambiguous
  // unless the constraint is named explicitly.
  const { data: grants, error: grantError } = await client
    .schema("app")
    .from("user_permissions")
    .select("user_id")
    .eq("permission_key", "manage_permissions");

  if (grantError) {
    throw new BootstrapError("READ_FAILED", "تعذر قراءة حالة التهيئة.", 502);
  }

  const governorIds = (grants ?? []).map(
    (row) => (row as { user_id: string }).user_id,
  );
  if (governorIds.length === 0) return false;

  const { data: active, error: userError } = await client
    .schema("app")
    .from("users")
    .select("id")
    .in("id", governorIds)
    .eq("active", true)
    .neq("phone", targetPhone)
    .limit(1);

  if (userError) {
    throw new BootstrapError("READ_FAILED", "تعذر قراءة حالة التهيئة.", 502);
  }

  return Array.isArray(active) && active.length > 0;
}

/**
 * Returns the auth user id for `phone`, creating the credential if absent and
 * resetting the password if present. The reset is what repairs an account whose
 * password was previously written by raw SQL and therefore never hashed.
 */
async function ensureAuthUser(
  client: SupabaseClient,
  phone: string,
  password: string,
): Promise<string> {
  const existing = await findProfileId(client, phone);

  if (existing) {
    const { error } = await client.auth.admin.updateUserById(existing, {
      password,
      phone_confirm: true,
    });
    if (error) {
      throw new BootstrapError(
        "AUTH_UPDATE_FAILED",
        "تعذر إعادة تعيين بيانات الدخول للحساب.",
        502,
      );
    }
    return existing;
  }

  const { data, error } = await client.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });

  if (!error && data.user) return data.user.id;

  // The account can exist in auth without a profile if the trigger was missing
  // when it was first created. Recover it by phone instead of failing.
  const orphanId = await findAuthUserIdByPhone(client, phone);
  if (orphanId) {
    const { error: updateError } = await client.auth.admin.updateUserById(
      orphanId,
      { password, phone_confirm: true },
    );
    if (!updateError) return orphanId;
  }

  throw new BootstrapError("AUTH_CREATE_FAILED", "تعذر إنشاء حساب الدخول.", 502);
}

async function findProfileId(
  client: SupabaseClient,
  phone: string,
): Promise<string | null> {
  const { data, error } = await client
    .schema("app")
    .from("users")
    .select("id")
    .eq("phone", phone)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new BootstrapError("PROFILE_READ_FAILED", "تعذر قراءة ملف المشغّل.", 502);
  }

  return data?.id ?? null;
}

async function findAuthUserIdByPhone(
  client: SupabaseClient,
  phone: string,
): Promise<string | null> {
  const { data, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error || !data?.users) return null;

  const match = data.users.find((user) => user.phone === phone);
  return match?.id ?? null;
}

/**
 * Upsert rather than update: the auth trigger normally creates the profile row,
 * but the upsert keeps this correct even if the trigger was absent. The
 * generated `global_scope` column is never written directly.
 */
async function attachProfile(
  client: SupabaseClient,
  userId: string,
  phone: string,
): Promise<void> {
  const { error } = await client
    .schema("app")
    .from("users")
    .upsert(
      {
        id: userId,
        phone,
        full_name: FULL_NAME,
        clearance_level: CLEARANCE_LEVEL,
        active: true,
      },
      { onConflict: "id" },
    );

  if (error) {
    throw new BootstrapError("PROFILE_WRITE_FAILED", "تعذر حفظ ملف المشغّل.", 502);
  }
}

async function grantAllPermissions(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const rows = PERMISSION_KEYS.map((permissionKey) => ({
    user_id: userId,
    permission_key: permissionKey,
    granted_by: userId,
  }));

  const { error } = await client
    .schema("app")
    .from("user_permissions")
    .upsert(rows, {
      onConflict: "user_id,permission_key",
      ignoreDuplicates: true,
    });

  if (error) {
    throw new BootstrapError("GRANT_FAILED", "تعذر منح صلاحيات المؤسس.", 502);
  }

  return rows.length;
}
