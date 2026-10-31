import {
  canAssignLevel,
  canGovernUser,
  canManageUser,
  isGlobalActor,
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
): void {
  if (target.id === session.user.id) {
    throw new RbacDeniedError(
      "SELF_MANAGEMENT",
      "لا يمكنك تعديل رتبتك أو صلاحياتك بنفسك.",
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
  },
): void {
  assertCanManage(session, target);
  const actor = actorFor(session);

  if (
    patch.clearanceLevel !== undefined &&
    !canAssignLevel(actor, patch.clearanceLevel)
  ) {
    throw new RbacDeniedError(
      "CLEARANCE_DENIED",
      "الرتبة الجديدة تتجاوز الرتبة التي يمكنك إسنادها.",
    );
  }

  if (
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
    !permissionsAreWithinActor(actor, patch.permissions)
  ) {
    throw new RbacDeniedError(
      "PERMISSION_ESCALATION",
      "لا يمكنك منح صلاحيات لا تملكها.",
    );
  }
}
