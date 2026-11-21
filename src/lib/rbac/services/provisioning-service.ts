import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { assertCanCreate } from "@/lib/rbac/management";
import type { Permission } from "@/lib/rbac/permissions";
import type { TeamRow } from "@/lib/rbac/team-repository";
import type { ActiveSession } from "@/lib/rbac/types";
import {
  provisionAccountSchema,
  type ProvisionAccountInput,
} from "@/lib/schemas/provisioning";

import { ProvisioningError } from "./provisioning-errors";
import { resolveTeam } from "./provisioning-team";
import {
  attachCityScope,
  attachGrants,
  attachProfile,
  createAuthUser,
} from "./provisioning-writes";

/**
 * Top-down provisioning. Kanjo has no public signup: an authorised operator
 * mints the auth account on the new joiner's behalf, then attaches the
 * capability grants and city scope.
 *
 * Every write below runs through the service-role client, so RLS is bypassed.
 * Authorization is therefore enforced here, in Tier 3, before any I/O —
 * `assertCanCreate` mirrors the same rules the SQL guards enforce.
 */

export { ProvisioningError };

export type ProvisionedAccount = {
  id: string;
  phone: string;
  email: string | null;
  clearanceLevel: number;
  globalScope: boolean;
  permissions: Permission[];
  accessibleCities: string[];
};

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
  if (!session.permissions.includes("manage_system_users")) {
    throw new ProvisioningError(
      "PERMISSION_DENIED",
      "لا تملك صلاحية إنشاء الحسابات.",
      403,
    );
  }

  const input = provisionAccountSchema.parse(rawInput);
  assertCanCreate(session, input);
  const team = await resolveTeam(session, input);
  return provision(input, grantorId(session), team);
}

async function provision(
  input: ProvisionAccountInput,
  grantedBy: string | null,
  team: TeamRow | null,
): Promise<ProvisionedAccount> {
  const client = getSupabaseServerClient();

  const authUser = await createAuthUser(client, input);

  try {
    await attachProfile(client, authUser.id, input, team);
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
