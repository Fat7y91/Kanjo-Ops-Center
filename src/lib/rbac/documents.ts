import { isPermission } from "./permissions";
import type { AppUser } from "./types";

/**
 * The operator document both RBAC reads speak.
 *
 * `app.rbac_session(uuid)` returns one of these for a single operator and
 * `app.rbac_user_directory()` returns an array of them for the whole roster, so
 * the mapping to `AppUser` lives here once instead of once per query path. A
 * column added to the profile is added in one place and both reads see it.
 *
 * Grant keys are filtered through the TypeScript catalogue, never trusted
 * as-is: a key the application does not know is not a capability it can check,
 * and `isPermission` is the single definition of that contract.
 */
export type OperatorDocument = {
  user: {
    id: string;
    name: string;
    email: string | null;
    title: string;
    team: string | null;
    teamId: string | null;
    teamName: string | null;
    clearanceLevel: number;
    globalScope: boolean;
    active: boolean;
    updatedAt: string;
  };
  permissions: string[] | null;
  cities: string[] | null;
};

export function toOperator(document: OperatorDocument): AppUser {
  const profile = document.user;
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email ?? "",
    title: profile.title,
    team: profile.team ?? "",
    teamName: profile.teamName,
    teamId: profile.teamId,
    permissions: (document.permissions ?? []).filter(isPermission),
    accessibleCities: document.cities ?? [],
    clearanceLevel: profile.clearanceLevel,
    globalScope: profile.globalScope,
    active: profile.active,
    updatedAt: profile.updatedAt,
  };
}
