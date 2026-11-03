import {
  canAssignLevel,
  canGovernUser,
  canManageUser,
  isGlobalActor,
  isSelf,
  maySelfGrant,
  permissionsAreWithinActor,
  scopeIsWithinActor,
  toClearanceActor,
  type ClearanceActor,
} from "@/lib/rbac/hierarchy";
import type { Permission } from "@/lib/rbac/permissions";
import type { ActiveSession, AppUser } from "@/lib/rbac/types";

export class RbacDeniedError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 403) {
    super(message);
    this.name = "RbacDeniedError";
    this.code = code;
    this.status = status;
  }
}

export function actorFor(session: ActiveSession): ClearanceActor {
  return toClearanceActor(session);
}

export function assertCanManage(
  session: ActiveSession,
  target: Pick<AppUser, "id" | "clearanceLevel" | "accessibleCities">,
  options: { allowSelf?: boolean } = {},
): void {
  if (isSelf(actorFor(session), target)) {
    // The system-users surface lets an operator see and edit their own record.
    // Deletion passes `allowSelf: false`, so an account can never remove itself.
    if (options.allowSelf) return;
    throw new RbacDeniedError(
      "SELF_MANAGEMENT",
      "لا يمكنك حذف حسابك بنفسك.",
    );
  }
  if (!canManageUser(actorFor(session), target)) {
    throw new RbacDeniedError(
      "CLEARANCE_DENIED",
      "هذا المشغّل خارج رتبتك أو نطاق مدنك.",
    );
  }
}

export function assertCanGovern(
  session: ActiveSession,
  target: Pick<AppUser, "id" | "clearanceLevel" | "accessibleCities">,
): void {
  if (target.id === session.user.id) {
    throw new RbacDeniedError(
      "SELF_MANAGEMENT",
      "لا يمكنك إدارة نفسك.",
    );
  }
  if (!canGovernUser(actorFor(session), target)) {
    throw new RbacDeniedError(
      "CLEARANCE_DENIED",
      "هذا المشغّل خارج رتبتك أو نطاق مدنك.",
    );
  }
}

export function assertCanCreate(
  session: ActiveSession,
  input: {
    clearanceLevel: number;
    accessibleCities: readonly string[];
    permissions: readonly Permission[];
  },
): void {
  const actor = actorFor(session);

  if (!canAssignLevel(actor, input.clearanceLevel)) {
    throw new RbacDeniedError(
      "CLEARANCE_DENIED",
      "لا يمكنك إنشاء مشغّل برتبة تتجاوز رتبتك.",
    );
  }

  if (!scopeIsWithinActor(actor, input.accessibleCities)) {
    throw new RbacDeniedError(
      "SCOPE_DENIED",
      "نطاق المدن المطلوب يتجاوز مدنك المتاحة.",
    );
  }

  if (!permissionsAreWithinActor(actor, input.permissions)) {
    throw new RbacDeniedError(
      "PERMISSION_ESCALATION",
      "لا يمكنك منح صلاحيات لا تملكها.",
    );
  }

  if (input.clearanceLevel >= 3 && !isGlobalActor(actor)) {
    throw new RbacDeniedError(
      "CLEARANCE_DENIED",
      "الرتب العالمية مخصصة للإدارة التنفيذية فقط.",
    );
  }
}

export function assertCanPatch(
  session: ActiveSession,
  target: AppUser,
  patch: {
    clearanceLevel?: number;
    accessibleCities?: readonly string[];
    permissions?: readonly Permission[];
    active?: boolean;
  },
): void {
  const actor = actorFor(session);
  const self = isSelf(actor, target);

  assertCanManage(session, target, { allowSelf: true });

  if (self && patch.active === false) {
    // Suspending your own account is the same lockout as deleting it.
    throw new RbacDeniedError(
      "SELF_MANAGEMENT",
      "لا يمكنك تعطيل حسابك بنفسك.",
    );
  }

  if (
    self &&
    patch.permissions !== undefined &&
    target.permissions.includes("manage_system_users") &&
    !patch.permissions.includes("manage_system_users")
  ) {
    // Dropping your own governorship locks you out of this very surface. Ask
    // another active governor to revoke it instead.
    throw new RbacDeniedError(
      "SELF_MANAGEMENT",
      "لا يمكنك سحب إدارة المستخدمين من حسابك بنفسك.",
    );
  }

  if (
    self &&
    patch.clearanceLevel !== undefined &&
    patch.clearanceLevel !== target.clearanceLevel
  ) {
    // Editing your own capability set is allowed; promoting yourself is not.
    // Rank changes stay strictly hierarchical even for the top tier.
    throw new RbacDeniedError(
      "CLEARANCE_DENIED",
      "لا يمكنك تغيير رتبتك بنفسك.",
    );
  }

  if (
    !self &&
    patch.clearanceLevel !== undefined &&
    !canAssignLevel(actor, patch.clearanceLevel)
  ) {
    throw new RbacDeniedError(
      "CLEARANCE_DENIED",
      "الرتبة الجديدة تتجاوز الرتبة التي يمكنك إسنادها.",
    );
  }

  if (
    !self &&
    patch.clearanceLevel !== undefined &&
    patch.clearanceLevel >= 3 &&
    !isGlobalActor(actor)
  ) {
    throw new RbacDeniedError(
      "CLEARANCE_DENIED",
      "الرتب العالمية مخصصة للإدارة التنفيذية فقط.",
    );
  }

  if (
    patch.accessibleCities !== undefined &&
    !scopeIsWithinActor(actor, patch.accessibleCities)
  ) {
    throw new RbacDeniedError(
      "SCOPE_DENIED",
      "نطاق المدن الجديد يتجاوز مدنك المتاحة.",
    );
  }

  if (
    patch.permissions !== undefined &&
    !(self
      ? maySelfGrant(actor, patch.permissions)
      : permissionsAreWithinActor(actor, patch.permissions))
  ) {
    throw new RbacDeniedError(
      "PERMISSION_ESCALATION",
      "لا يمكنك منح صلاحيات لا تملكها.",
    );
  }
}

/**
 * Capabilities the actor is about to add to the target.
 *
 * Shared by the PATCH route and `assertCanPatch` so the per-key check and the
 * full-set check cannot drift. A self-grant is compared against `maySelfGrant`
 * rather than the strict subset rule.
 */
export function assertCanGrant(
  session: ActiveSession,
  target: Pick<AppUser, "id" | "permissions">,
  additions: readonly Permission[],
): void {
  if (additions.length === 0) return;
  const actor = actorFor(session);
  const allowed = isSelf(actor, target)
    ? maySelfGrant(actor, additions)
    : permissionsAreWithinActor(actor, additions);
  if (!allowed) {
    throw new RbacDeniedError(
      "PERMISSION_ESCALATION",
      "لا يمكنك منح صلاحيات لا تملكها.",
    );
  }
}
