import type { Permission } from "./permissions";

/**
 * Application identity. There is deliberately no `role` field: authorization
 * decisions are made exclusively from the `permissions` capability set.
 *
 * `title` is presentation-only and must never be used to gate UI or routes.
 */
export type AppUser = {
  id: string;
  name: string;
  email: string;
  title: string;
  /** Deprecated free-text label; `teamId` is authoritative. */
  team: string;
  /**
   * Display name of the joined city-owned team (`app.field_teams.name`).
   * Null when the operator has no team or the deployment predates the table.
   * Never use it for authorization: `teamId` is the identity.
   */
  teamName?: string | null;
  /** `app.field_teams.id`, or null when the operator has no team. */
  teamId?: string | null;
  permissions: Permission[];
  accessibleCities: string[];
  clearanceLevel: number;
  globalScope: boolean;
  active: boolean;
  updatedAt: string;
};

/**
 * A field team owned by exactly one city (`app.field_teams`).
 *
 * Teams are not global: allocation belongs to a city, so the id is the handle
 * the provisioning flow persists on `app.users.team_id`. The name deliberately
 * avoids `FieldTeam`, which is the legacy A/B team union in `field-ops/types`.
 */
export type CityTeam = {
  id: string;
  cityId: string;
  name: string;
};

export type SessionUser = Pick<
  AppUser,
  "id" | "name" | "email" | "title" | "team"
>;

export type ActiveSession = {
  user: SessionUser;
  permissions: Permission[];
  accessibleCities: string[];
  clearanceLevel: number;
  globalScope: boolean;
  revision: number;
};
