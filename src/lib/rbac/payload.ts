import { z } from "zod";

import type { AppUser, CityTeam } from "./types";

/**
 * Wire contract for `GET /api/admin/users`.
 *
 * The matrix renders one card per operator and needs the roster, the revision,
 * the viewer's own scope, the assignable ladder, the reachable cities and the
 * team catalogue. Element shapes stay typed by the RBAC types both sides
 * compile against; the boundary check is on the envelope, so a redirect or an
 * error body cannot be mistaken for a roster.
 *
 * This module is imported by the island, so it must not reach a repository or
 * a store — only the type imports above.
 */
export type AssignableLevel = { level: number; label: string };
export type AssignableCity = { id: string; name: string };

export type PermissionMatrixPayload = {
  users: AppUser[];
  revision: number;
  viewerId: string;
  viewer: { clearanceLevel: number; globalScope: boolean };
  assignableLevels: AssignableLevel[];
  assignableCities: AssignableCity[];
  teams: CityTeam[];
};

function isPermissionMatrixPayload(
  value: unknown,
): value is PermissionMatrixPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.users)) return false;
  if (typeof payload.revision !== "number") return false;
  if (typeof payload.viewerId !== "string") return false;
  if (typeof payload.viewer !== "object" || payload.viewer === null) {
    return false;
  }
  if (!Array.isArray(payload.assignableLevels)) return false;
  if (!Array.isArray(payload.assignableCities)) return false;
  return Array.isArray(payload.teams);
}

export const permissionMatrixPayloadSchema = z.custom<PermissionMatrixPayload>(
  isPermissionMatrixPayload,
  { message: "RBAC payload does not match the expected shape." },
);
