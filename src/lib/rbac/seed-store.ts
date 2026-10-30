import { SEED_USERS } from "./seed-users";
import type { AppUser } from "./types";

/**
 * In-memory RBAC store, used only when Supabase is not configured.
 *
 * Kept separate from `users.ts` so the facade stays about *which* source wins,
 * not about how the fallback is stored. Process-local by design: it exists so
 * local dev and CI builds render without credentials, never as production
 * persistence.
 */

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

export function normalizeLevel(value: number): number {
  return Math.max(1, Math.min(4, Math.trunc(value)));
}

export function cloneUser(user: AppUser): AppUser {
  const clearanceLevel = normalizeLevel(user.clearanceLevel ?? 1);
  return {
    ...user,
    permissions: [...user.permissions],
    accessibleCities: [...user.accessibleCities],
    clearanceLevel,
    globalScope: user.globalScope ?? clearanceLevel >= 3,
  };
}

export function getSeedStore(): RbacStore {
  if (!globalStore.__kanjoV2RbacStoreV2) {
    globalStore.__kanjoV2RbacStoreV2 = {
      users: new Map(SEED_USERS.map((user) => [user.id, cloneUser(user)])),
      revision: 1,
    };
  }
  return globalStore.__kanjoV2RbacStoreV2;
}

function governorRemains(
  users: Iterable<AppUser>,
  candidateId: string,
): boolean {
  for (const user of users) {
    if (
      user.id !== candidateId &&
      user.active &&
      user.permissions.includes("manage_permissions")
    ) {
      return true;
    }
  }
  return false;
}

/** Shared by the seed store and the remote store: one rule, one message. */
export function assertActiveGovernor(
  users: Iterable<AppUser>,
  candidateId: string,
): void {
  if (!governorRemains(users, candidateId)) {
    throw new PermissionInvariantError(
      "At least one active operator must retain manage_permissions.",
    );
  }
}
