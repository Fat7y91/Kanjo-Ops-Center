import {
  PERMISSIONS,
  type PermissionDefinition,
} from "./data/permissions";

export { PERMISSIONS, type PermissionDefinition };

/**
 * The single source of truth for every capability in V2.
 *
 * The catalogue itself is generated data in `./data/permissions.ts` (97 rows,
 * mirroring `app.permissions`). This module adds the derived types and lookups
 * that UI components, route middleware, server guards and API handlers consume.
 * No surface should ever branch on a job title or role name.
 */

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: readonly Permission[] = PERMISSIONS.map(
  (permission) => permission.key,
);

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(PERMISSION_KEYS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && PERMISSION_KEY_SET.has(value);
}

export function permissionDefinition(
  permission: Permission,
): PermissionDefinition {
  return (
    PERMISSIONS.find((candidate) => candidate.key === permission) ??
    PERMISSIONS[0]
  );
}

export type PermissionGroup = {
  name: string;
  items: readonly PermissionDefinition[];
};

export const PERMISSION_GROUPS: readonly PermissionGroup[] = Array.from(
  new Set(PERMISSIONS.map((permission) => permission.group)),
).map((group) => ({
  name: group,
  items: PERMISSIONS.filter((permission) => permission.group === group),
}));
