import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { resolveAgainstCatalogue } from "./permission-catalogue";
import type { Permission } from "./permissions";

/**
 * Tier 4 write path for the RBAC domain.
 *
 * Split from `repository.ts` (reads and the pre-migration snapshot) so each
 * file keeps one responsibility. `repository.ts` re-exports everything here, so
 * callers keep importing from one place.
 */

export type UserPatchInput = {
  permissions?: readonly Permission[];
  clearanceLevel?: number;
  accessibleCities?: readonly string[];
  active?: boolean;
};

/**
 * What a write could not store.
 *
 * `skippedPermissions` lists requested capabilities that this deployment's
 * `app.permissions` catalogue does not hold yet, so no grant row could be
 * created for them. Empty when everything landed.
 */
export type ProfileWriteResult = {
  skippedPermissions: string[];
};

/** Rewrites the profile row, then the grant and scope membership. */
export async function updateUserProfile(
  id: string,
  patch: UserPatchInput,
): Promise<ProfileWriteResult> {
  const client = getSupabaseServerClient();
  let skippedPermissions: string[] = [];

  if (patch.clearanceLevel !== undefined || patch.active !== undefined) {
    const profile: Record<string, unknown> = {};
    if (patch.clearanceLevel !== undefined) {
      profile.clearance_level = patch.clearanceLevel;
    }
    if (patch.active !== undefined) profile.active = patch.active;

    const { error } = await client
      .schema("app")
      .from("users")
      .update(profile)
      .eq("id", id);
    if (error) throw error;
  }

  if (patch.permissions !== undefined) {
    // Diff, never truncate-and-reinsert. `manage_system_users` is protected by a
    // deferred constraint trigger (`assert_governor_remaining`), so deleting the
    // sole governor's grant and re-adding it in a second statement would abort
    // the transaction at commit. Additions first, removals second: the invariant
    // is only ever observed on a full set.
    const { data: current, error: readError } = await client
      .schema("app")
      .from("user_permissions")
      .select("permission_key")
      .eq("user_id", id);
    if (readError) throw readError;

    const held = new Set(
      (current ?? []).map(
        (row) => (row as { permission_key: string }).permission_key,
      ),
    );
    const next = new Set<string>(patch.permissions);
    const added = [...next].filter((key) => !held.has(key));
    const removed = [...held].filter((key) => !next.has(key));

    if (added.length > 0) {
      // `permission_key` is a foreign key into `app.permissions`: a capability
      // this deployment has not seeded yet cannot be stored at all. Resolving
      // first keeps the rest of the patch (every other grant, the profile row,
      // the city scope) from failing with it, and turns the remainder into an
      // explicit report instead of a bare 500.
      const { data: catalogue, error: catalogueError } = await client
        .schema("app")
        .from("permissions")
        .select("key");
      if (catalogueError) throw catalogueError;

      const resolution = resolveAgainstCatalogue(
        added,
        (catalogue ?? []).map((row) => (row as { key: string }).key),
      );
      skippedPermissions = resolution.missing;

      if (resolution.granted.length > 0) {
        const { error } = await client
          .schema("app")
          .from("user_permissions")
          .insert(
            resolution.granted.map((permissionKey) => ({
              user_id: id,
              permission_key: permissionKey,
            })),
          );
        if (error) throw error;
      }
    }

    if (removed.length > 0) {
      const { error } = await client
        .schema("app")
        .from("user_permissions")
        .delete()
        .eq("user_id", id)
        .in("permission_key", removed);
      if (error) throw error;
    }
  }

  if (patch.accessibleCities !== undefined) {
    const { error: clearError } = await client
      .schema("app")
      .from("user_city_scope")
      .delete()
      .eq("user_id", id);
    if (clearError) throw clearError;

    if (patch.accessibleCities.length > 0) {
      const { error } = await client
        .schema("app")
        .from("user_city_scope")
        .insert(
          patch.accessibleCities.map((cityId) => ({
            user_id: id,
            city_id: cityId,
          })),
        );
      if (error) throw error;
    }
  }

  return { skippedPermissions };
}

export async function deleteUserProfile(id: string): Promise<void> {
  const client = getSupabaseServerClient();
  const { error } = await client.schema("app").from("users").delete().eq("id", id);
  if (error) throw error;
}
