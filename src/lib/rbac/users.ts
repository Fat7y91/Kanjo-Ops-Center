import { isPermission, type Permission } from "./permissions";
import {
  deleteUserProfile,
  getRbacRevision as getRemoteRevision,
  getUserProfile,
  isRbacDatabaseConfigured,
  listUserProfiles,
  updateUserProfile,
  type UserPatchInput,
} from "./repository";
import {
  assertActiveGovernor,
  cloneUser,
  getSeedStore,
  normalizeLevel,
  PermissionInvariantError,
} from "./seed-store";
import type { AppUser } from "./types";

/**
 * RBAC read/write facade.
 *
 * Supabase is authoritative whenever it is configured (see `repository.ts`).
 * The in-memory seed roster is only used when there is no database attached, so
 * local dev and CI builds still render without credentials. The two sources are
 * never merged: a configured database fully replaces the seed, and a missing
 * row means "no such operator" rather than "use a demo account".
 */
export { PermissionInvariantError };

export async function listUsers(): Promise<AppUser[]> {
  // An empty table is a valid answer ("no operators provisioned yet"), so the
  // presence of the database — not the row count — decides which source wins.
  if (isRbacDatabaseConfigured()) {
    const remote = await listUserProfiles();
    return (remote ?? []).map(cloneUser);
  }

  return Array.from(getSeedStore().users.values())
    .map(cloneUser)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getUserById(id: string): Promise<AppUser | null> {
  // Never fall back to the seed once a database is attached: a missing row must
  // mean "no such operator", not "resolve a demo account instead".
  if (isRbacDatabaseConfigured()) {
    const remote = await getUserProfile(id);
    return remote ? cloneUser(remote) : null;
  }

  const user = getSeedStore().users.get(id);
  return user ? cloneUser(user) : null;
}

export async function getRbacRevision(): Promise<number> {
  if (isRbacDatabaseConfigured()) return getRemoteRevision();
  return getSeedStore().revision;
}

export type CreateUserInput = {
  name: string;
  email: string;
  title: string;
  team: string;
  permissions: readonly Permission[];
  accessibleCities: readonly string[];
  clearanceLevel: number;
};

/**
 * Legacy in-memory create. Supabase-backed creation happens in
 * `services/provisioning-service.ts`, which mints the auth credential first.
 * This remains for seed mode only and refuses to run against a real database,
 * because it cannot create a login credential.
 */
export async function createUser(input: CreateUserInput): Promise<AppUser> {
  if (isRbacDatabaseConfigured()) {
    throw new PermissionInvariantError(
      "Use createUserAccount() to provision accounts against Supabase.",
    );
  }

  const store = getSeedStore();
  const email = input.email.trim().toLowerCase();

  if (
    Array.from(store.users.values()).some(
      (user) => user.email.trim().toLowerCase() === email,
    )
  ) {
    throw new PermissionInvariantError(
      "An operator with this email already exists.",
    );
  }

  const slug =
    email
      .split("@")[0]
      ?.replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "operator";

  let id = `u-${slug}`;
  let suffix = 2;
  while (store.users.has(id)) {
    id = `u-${slug}-${suffix}`;
    suffix += 1;
  }

  const clearanceLevel = normalizeLevel(input.clearanceLevel);
  const created: AppUser = {
    id,
    name: input.name.trim(),
    email,
    title: input.title.trim(),
    team: input.team.trim(),
    permissions: normalizePermissions(input.permissions),
    accessibleCities: Array.from(
      new Set(input.accessibleCities.map((cityId) => cityId.trim())),
    ).filter(Boolean),
    clearanceLevel,
    globalScope: clearanceLevel >= 3,
    active: true,
    updatedAt: new Date().toISOString(),
  };

  store.users.set(id, created);
  store.revision += 1;
  return cloneUser(created);
}

export type UserPatch = UserPatchInput;

export async function updateUser(
  id: string,
  patch: UserPatch,
): Promise<AppUser> {
  const current = await getUserById(id);
  if (!current) throw new Error("User not found");

  const nextPermissions =
    patch.permissions === undefined
      ? current.permissions
      : normalizePermissions(patch.permissions);
  const nextLevel =
    patch.clearanceLevel === undefined
      ? current.clearanceLevel
      : normalizeLevel(patch.clearanceLevel);
  const nextActive = patch.active === undefined ? current.active : patch.active;
  const nextCities =
    patch.accessibleCities === undefined
      ? current.accessibleCities
      : Array.from(
          new Set(patch.accessibleCities.map((cityId) => cityId.trim())),
        ).filter(Boolean);

  const staysGovernor =
    nextActive && nextPermissions.includes("manage_permissions");
  const wasGovernor =
    current.active && current.permissions.includes("manage_permissions");

  if (wasGovernor && !staysGovernor) {
    assertActiveGovernor(await listUsers(), id);
  }

  if (isRbacDatabaseConfigured()) {
    await updateUserProfile(id, {
      permissions: nextPermissions,
      clearanceLevel: nextLevel,
      accessibleCities: nextCities,
      active: nextActive,
    });
  } else {
    const store = getSeedStore();
    store.users.set(id, {
      ...current,
      permissions: nextPermissions,
      accessibleCities: nextCities,
      clearanceLevel: nextLevel,
      globalScope: nextLevel >= 3,
      active: nextActive,
      updatedAt: new Date().toISOString(),
    });
    store.revision += 1;
  }

  // Demoting below L3 drops the global bypass but keeps the explicit city
  // list, so the operator retains only the geography they can still see.
  return {
    ...current,
    permissions: nextPermissions,
    accessibleCities: nextCities,
    clearanceLevel: nextLevel,
    globalScope: nextLevel >= 3,
    active: nextActive,
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteUser(id: string): Promise<AppUser> {
  const current = await getUserById(id);
  if (!current) throw new Error("User not found");

  if (current.active && current.permissions.includes("manage_permissions")) {
    assertActiveGovernor(await listUsers(), id);
  }

  if (isRbacDatabaseConfigured()) {
    await deleteUserProfile(id);
  } else {
    const store = getSeedStore();
    store.users.delete(id);
    store.revision += 1;
  }

  return cloneUser(current);
}

export async function addUserCityScope(
  id: string,
  cityId: string,
): Promise<AppUser> {
  const current = await getUserById(id);
  if (!current) throw new Error("User not found");

  if (current.accessibleCities.includes(cityId)) return current;

  return updateUser(id, {
    accessibleCities: [...current.accessibleCities, cityId],
  });
}

export async function removeUserCityScope(
  id: string,
  cityId: string,
): Promise<AppUser> {
  const current = await getUserById(id);
  if (!current) throw new Error("User not found");

  if (!current.accessibleCities.includes(cityId)) return current;

  return updateUser(id, {
    accessibleCities: current.accessibleCities.filter(
      (candidate) => candidate !== cityId,
    ),
  });
}

export function normalizePermissions(values: readonly unknown[]): Permission[] {
  return Array.from(
    new Set(values.filter((value): value is Permission => isPermission(value))),
  );
}

/**
 * Replace a user's capability set. Writes go to Supabase when configured;
 * otherwise they mutate the seed store in this isolate.
 */
export async function updateUserPermissions(
  id: string,
  permissions: readonly Permission[],
): Promise<AppUser> {
  return updateUser(id, { permissions });
}
