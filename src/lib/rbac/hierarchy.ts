import type { Permission } from "@/lib/rbac/permissions";
import type { ActiveSession, AppUser } from "@/lib/rbac/types";

export const MAX_CLEARANCE_LEVEL = 4;

export type ClearanceDefinition = {
  level: number;
  label: string;
  labelEn: string;
  tone: string;
  description: string;
};

export const CLEARANCE_LEVELS: readonly ClearanceDefinition[] = [
  {
    level: 4,
    label: "مدير النظام",
    labelEn: "System Admin",
    tone: "badge-red",
    description: "أعلى سلطة تقنية. يتجاوز نطاق المدن ويحكم كل الرتب الأدنى.",
  },
  {
    level: 3,
    label: "المؤسسون",
    labelEn: "Founder / Owner",
    tone: "badge-gold",
    description: "وصول عالمي للمدن مع سلطة كاملة فوق مدراء التشغيل والمندوبين.",
  },
  {
    level: 2,
    label: "مدير تشغيل المدينة",
    labelEn: "City Operations Manager",
    tone: "badge-purple",
    description: "يدير المندوبين داخل مدنه فقط، ولا يتجاوز أقرانه أو الرتب الأعلى.",
  },
  {
    level: 1,
    label: "المندوب",
    labelEn: "Field Rep",
    tone: "badge-blue",
    description: "المستوى الأساسي. لا يملك سلطة إدارية على المستخدمين.",
  },
] as const;

export type ClearanceActor = {
  id: string;
  clearanceLevel: number;
  permissions: readonly Permission[];
  accessibleCities: readonly string[];
  globalScope: boolean;
};

export function toClearanceActor(session: ActiveSession): ClearanceActor {
  return {
    id: session.user.id,
    clearanceLevel: session.clearanceLevel,
    permissions: session.permissions,
    accessibleCities: session.accessibleCities,
    globalScope: session.globalScope,
  };
}

/** True when the actor is looking at their own account. */
export function isSelf(
  actor: Pick<ClearanceActor, "id">,
  target: Pick<AppUser, "id">,
): boolean {
  return target.id === actor.id;
}

export function clearanceLabel(level: number): string {
  return (
    CLEARANCE_LEVELS.find((item) => item.level === level)?.label ??
    `المستوى ${level}`
  );
}

export function clearanceTone(level: number): string {
  return (
    CLEARANCE_LEVELS.find((item) => item.level === level)?.tone ?? "badge"
  );
}

/** Executive tier: the co-founding rank and above. */
export const EXECUTIVE_LEVEL = 3;

export function isExecutive(level: number): boolean {
  return level >= EXECUTIVE_LEVEL;
}

export function isGlobalActor(
  actor: Pick<ClearanceActor, "clearanceLevel" | "globalScope">,
): boolean {
  // Level 3+ is global by definition (`app.users.global_scope` is generated from
  // it in SQL), so the flag can only ever widen access, never narrow it.
  return actor.globalScope || isExecutive(actor.clearanceLevel);
}

export function outranks(
  actor: Pick<ClearanceActor, "clearanceLevel">,
  target: Pick<AppUser, "clearanceLevel">,
): boolean {
  return actor.clearanceLevel > target.clearanceLevel;
}

/**
 * Whether the actor stands above the target rank.
 *
 * The Hierarchy Security Rule is strict in both directions: an operator with
 * `manage_system_users` may only see, edit and create users whose clearance is
 * STRICTLY lower than their own. Peers and superiors are invisible on the
 * users surface, for executives included — the founder redefined peer-minting
 * out of the model.
 *
 * This is the pure rank comparison. Self-access is an explicit exception in
 * `canManageUser`, not a relaxation of the rule.
 */
export function governsLevel(
  actor: Pick<ClearanceActor, "clearanceLevel" | "globalScope">,
  target: Pick<AppUser, "clearanceLevel">,
): boolean {
  return actor.clearanceLevel > target.clearanceLevel;
}

export function sharesCityScope(
  actor: ClearanceActor,
  target: Pick<AppUser, "accessibleCities">,
): boolean {
  if (isGlobalActor(actor)) return true;
  // A target with no geographic claim yet is governable by anyone who outranks
  // them; the actor can only ever grant cities from their own scope.
  if (target.accessibleCities.length === 0) return true;
  return target.accessibleCities.some((cityId) =>
    actor.accessibleCities.includes(cityId),
  );
}

/**
 * Whether the actor may govern the target account.
 *
 * City-manager assignment uses this, so it stays strictly hierarchical in both
 * directions: no self-appointment, no peers, no superiors. The self exception
 * for editing one's own system-user record lives in `canManageUser`, not here.
 */
export function canGovernUser(
  actor: ClearanceActor,
  target: Pick<AppUser, "id" | "clearanceLevel" | "accessibleCities">,
): boolean {
  if (isSelf(actor, target)) return false;
  return governsLevel(actor, target) && sharesCityScope(actor, target);
}

/**
 * Whether the actor may see and edit the target on the system-users surface.
 *
 * The capability gate still applies: without `manage_system_users` the roster
 * is closed. Inside that gate, the Hierarchy Security Rule is strict for every
 * other account (strictly lower rank, overlapping city scope), but the actor's
 * own record is always reachable. An L4 cannot edit a peer L4, yet must be able
 * to grant themselves a newly seeded capability — otherwise a permission added
 * by migration could never be handed out through the UI.
 */
export function canManageUser(
  actor: ClearanceActor,
  target: Pick<AppUser, "id" | "clearanceLevel" | "accessibleCities">,
): boolean {
  if (!actor.permissions.includes("manage_system_users")) return false;
  if (isSelf(actor, target)) return true;
  return canGovernUser(actor, target);
}

export function filterManageableUsers<
  T extends Pick<AppUser, "id" | "clearanceLevel" | "accessibleCities">,
>(actor: ClearanceActor, users: readonly T[]): T[] {
  return users.filter((user) => canManageUser(actor, user));
}

export function filterGovernableUsers<
  T extends Pick<AppUser, "id" | "clearanceLevel" | "accessibleCities">,
>(actor: ClearanceActor, users: readonly T[]): T[] {
  return users.filter((user) => canGovernUser(actor, user));
}

/**
 * Highest clearance an actor may hand out.
 *
 * Strictly lower than the actor's own rank, always. Executives no longer mint
 * peers: under the Hierarchy Security Rule an L4 may assign at most L3 and can
 * never see or edit another L4 account.
 */
export function maxAssignableLevel(
  actor: Pick<ClearanceActor, "clearanceLevel" | "globalScope">,
): number {
  return Math.max(0, Math.min(MAX_CLEARANCE_LEVEL, actor.clearanceLevel - 1));
}

/** True when the actor may assign the given clearance level. */
export function canAssignLevel(
  actor: Pick<ClearanceActor, "clearanceLevel" | "globalScope">,
  level: number,
): boolean {
  return level >= 1 && level <= maxAssignableLevel(actor);
}

export function assignableLevels(actor: ClearanceActor): ClearanceDefinition[] {
  const max = maxAssignableLevel(actor);
  return CLEARANCE_LEVELS.filter((item) => item.level <= max);
}

export function scopeIsWithinActor(
  actor: ClearanceActor,
  cityIds: readonly string[],
): boolean {
  if (isGlobalActor(actor)) return true;
  return cityIds.every((cityId) => actor.accessibleCities.includes(cityId));
}

export function permissionsAreWithinActor(
  actor: ClearanceActor,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) =>
    actor.permissions.includes(permission),
  );
}

/**
 * Whether the actor may add the given capabilities to their own account.
 *
 * The top rank is defined to hold the whole catalogue (`app.permissions`), so
 * an L4 self-grant cannot exceed anything they are not already entitled to; it
 * only fills in keys seeded after their last backfill. Every other rank stays
 * inside the subset they were granted, so a lower admin still cannot mint a
 * capability they were never given.
 */
export function maySelfGrant(
  actor: ClearanceActor,
  permissions: readonly Permission[],
): boolean {
  if (actor.clearanceLevel >= MAX_CLEARANCE_LEVEL) return true;
  return permissionsAreWithinActor(actor, permissions);
}
