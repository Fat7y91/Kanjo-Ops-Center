import {
  isPermission,
  type Permission,
} from "./permissions";
import { SEED_USERS } from "./seed-users";
import type { AppUser } from "./types";

export class PermissionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionInvariantError";
  }
}

type RbacStore = {
  users: Map<string, AppUser>;
  revision: number;
};

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2RbacStoreV2?: RbacStore;
};

function cloneUser(user: AppUser): AppUser {
  const clearanceLevel = normalizeLevel(user.clearanceLevel ?? 1);
  return {
    ...user,
    permissions: [...user.permissions],
    accessibleCities: [...user.accessibleCities],
    clearanceLevel,
    globalScope: user.globalScope ?? clearanceLevel >= 3,
  };
}

function getStore(): RbacStore {
  if (!globalStore.__kanjoV2RbacStoreV2) {
    globalStore.__kanjoV2RbacStoreV2 = {
      users: new Map(SEED_USERS.map((user) => [user.id, cloneUser(user)])),
      revision: 1,
    };
  }
  return globalStore.__kanjoV2RbacStoreV2;
}

function normalizeLevel(value: number): number {
  return Math.max(1, Math.min(4, Math.trunc(value)));
}

function assertActiveGovernor(store: RbacStore, candidateId: string): void {
  const remainingGovernors = Array.from(store.users.values()).filter(
    (user) =>
      user.id !== candidateId &&
      user.active &&
      user.permissions.includes("manage_permissions"),
  );
  if (remainingGovernors.length === 0) {
    throw new PermissionInvariantError(
      "At least one active operator must retain manage_permissions.",
    );
  }
}

export function listUsers(): AppUser[] {
  return Array.from(getStore().users.values())
    .map(cloneUser)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getUserById(id: string): AppUser | null {
  const user = getStore().users.get(id);
  return user ? cloneUser(user) : null;
}

export function getRbacRevision(): number {
  return getStore().revision;
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

export function createUser(input: CreateUserInput): AppUser {
  const store = getStore();
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

export type UserPatch = {
  permissions?: readonly Permission[];
  clearanceLevel?: number;
  accessibleCities?: readonly string[];
  active?: boolean;
};

export function updateUser(id: string, patch: UserPatch): AppUser {
  const store = getStore();
  const current = store.users.get(id);
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
          new Set(
            patch.accessibleCities.map((cityId) => cityId.trim()),
          ),
        ).filter(Boolean);

  const staysGovernor =
    nextActive && nextPermissions.includes("manage_permissions");
  const wasGovernor =
    current.active && current.permissions.includes("manage_permissions");

  if (wasGovernor && !staysGovernor) {
    assertActiveGovernor(store, id);
  }

  // Demoting below L3 drops the global bypass but keeps the explicit city
  // list, so the operator retains only the geography they can still see.
  const updated: AppUser = {
    ...current,
    permissions: nextPermissions,
    accessibleCities: nextCities,
    clearanceLevel: nextLevel,
    globalScope: nextLevel >= 3,
    active: nextActive,
    updatedAt: new Date().toISOString(),
  };

  store.users.set(id, updated);
  store.revision += 1;
  return cloneUser(updated);
}

export function deleteUser(id: string): AppUser {
  const store = getStore();
  const current = store.users.get(id);
  if (!current) throw new Error("User not found");

  if (current.active && current.permissions.includes("manage_permissions")) {
    assertActiveGovernor(store, id);
  }

  store.users.delete(id);
  store.revision += 1;
  return cloneUser(current);
}

export function addUserCityScope(id: string, cityId: string): AppUser {
  const current = getUserById(id);
  if (!current) throw new Error("User not found");

  if (current.accessibleCities.includes(cityId)) {
    return current;
  }

  return updateUser(id, {
    accessibleCities: [...current.accessibleCities, cityId],
  });
}

export function removeUserCityScope(id: string, cityId: string): AppUser {
  const current = getUserById(id);
  if (!current) throw new Error("User not found");

  if (!current.accessibleCities.includes(cityId)) {
    return current;
  }

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
 * Replace a user's capability set. The store is process-local for this scaffold;
 * swap this module for a durable repository without touching any UI or guard.
 */
export function updateUserPermissions(
  id: string,
  permissions: readonly Permission[],
): AppUser {
  return updateUser(id, { permissions });
}
