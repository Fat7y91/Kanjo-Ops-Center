import {
  isPermission,
  PERMISSION_KEYS,
  type Permission,
} from "./permissions";
import type { AppUser } from "./types";

export class PermissionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionInvariantError";
  }
}

const ALL_PERMISSIONS: Permission[] = [...PERMISSION_KEYS];

const SEED_USERS: AppUser[] = [
  {
    id: "u-owner",
    name: "Nour El-Sayed",
    email: "nour@kanjo.example",
    title: "Platform owner",
    team: "Executive",
    permissions: ALL_PERMISSIONS,
    active: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "u-ops",
    name: "Mariam Adel",
    email: "mariam@kanjo.example",
    title: "City operations manager",
    team: "City Operations",
    permissions: [
      "view_overview",
      "view_finance",
      "view_cities",
      "manage_cities",
      "view_merchants",
      "edit_merchants",
      "transfer_merchants",
      "view_field_ops",
      "manage_tasks",
      "assign_tasks",
      "approve_tasks",
      "request_transfers",
      "approve_transfers",
      "approve_edit_requests",
      "manage_merchant_state",
      "view_contracts",
    ],
    active: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "u-sales",
    name: "Omar Khaled",
    email: "omar@kanjo.example",
    title: "Merchant partnerships",
    team: "Fox Team",
    permissions: [
      "view_overview",
      "view_merchants",
      "create_merchants",
      "edit_merchants",
      "view_catalog",
      "view_contracts",
      "create_contracts",
      "view_field_ops",
      "request_transfers",
    ],
    active: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "u-catalog",
    name: "Salma Hany",
    email: "salma@kanjo.example",
    title: "Catalog desk",
    team: "Catalog",
    permissions: [
      "view_overview",
      "view_merchants",
      "view_catalog",
      "create_products",
      "edit_products",
    ],
    active: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "u-audit",
    name: "Youssef Tarek",
    email: "youssef@kanjo.example",
    title: "Contract audit",
    team: "Audit",
    permissions: [
      "view_overview",
      "view_contracts",
      "view_finance",
      "view_cities",
    ],
    active: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "u-rep-fox",
    name: "Hassan Mostafa",
    email: "hassan@kanjo.example",
    title: "Field representative",
    team: "Fox Team",
    permissions: [
      "view_overview",
      "view_merchants",
      "view_catalog",
      "view_field_ops",
      "request_transfers",
    ],
    active: true,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "u-rep-power",
    name: "Dina Samir",
    email: "dina@kanjo.example",
    title: "Field representative",
    team: "Power Team",
    permissions: [
      "view_overview",
      "view_merchants",
      "view_catalog",
      "view_field_ops",
      "request_transfers",
    ],
    active: true,
    updatedAt: new Date(0).toISOString(),
  },
];

type RbacStore = {
  users: Map<string, AppUser>;
  revision: number;
};

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2RbacStore?: RbacStore;
};

function cloneUser(user: AppUser): AppUser {
  return { ...user, permissions: [...user.permissions] };
}

function getStore(): RbacStore {
  if (!globalStore.__kanjoV2RbacStore) {
    globalStore.__kanjoV2RbacStore = {
      users: new Map(SEED_USERS.map((user) => [user.id, cloneUser(user)])),
      revision: 1,
    };
  }
  return globalStore.__kanjoV2RbacStore;
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
  const store = getStore();
  const current = store.users.get(id);
  if (!current) throw new Error("User not found");

  const next = normalizePermissions(permissions);

  if (
    current.permissions.includes("manage_permissions") &&
    !next.includes("manage_permissions")
  ) {
    const remainingGovernors = Array.from(store.users.values()).filter(
      (user) =>
        user.id !== id &&
        user.active &&
        user.permissions.includes("manage_permissions"),
    );
    if (remainingGovernors.length === 0) {
      throw new PermissionInvariantError(
        "At least one active operator must retain manage_permissions.",
      );
    }
  }

  const updated: AppUser = {
    ...current,
    permissions: next,
    updatedAt: new Date().toISOString(),
  };

  store.users.set(id, updated);
  store.revision += 1;
  return cloneUser(updated);
}
