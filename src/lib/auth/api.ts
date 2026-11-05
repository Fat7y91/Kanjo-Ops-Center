import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerSession } from "@/lib/auth/server-session";
import { AccountsError } from "@/lib/accounts/store";
import { CatalogError } from "@/lib/catalog/store";
import { ImageQaError } from "@/lib/catalog/image-qa";
import { MarketingError } from "@/lib/marketing/store";
import { MissingEnvError } from "@/lib/db/env";
import { OperationsError } from "@/lib/operations/errors";
import { GovernanceError } from "@/lib/governance/errors";
import { FieldOpsError } from "@/lib/field-ops/store";
import type { Permission } from "@/lib/rbac/permissions";
import { TaxonomyError } from "@/lib/taxonomy/store";
import type { ActiveSession } from "@/lib/rbac/types";

type Authorization =
  | { session: ActiveSession; response: null }
  | { session: null; response: NextResponse };

export async function authorize(
  permission: Permission,
): Promise<Authorization> {
  const session = await getServerSession();
  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "يلزم تسجيل الدخول." },
        { status: 401 },
      ),
    };
  }
  if (!session.permissions.includes(permission)) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "لا تملك هذه الصلاحية." },
        { status: 403 },
      ),
    };
  }
  return { session, response: null };
}

/**
 * Rank-based counterpart of `authorize()`. Some surfaces are gated by
 * clearance rather than by a capability key — `app.commission_rates` writes
 * require `app.has_min_clearance(4)` in SQL — and the API mirror must match
 * the policy instead of re-deriving it from permissions.
 */
export async function authorizeMinClearance(
  level: number,
): Promise<Authorization> {
  const session = await getServerSession();
  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "يلزم تسجيل الدخول." },
        { status: 401 },
      ),
    };
  }
  if (session.clearanceLevel < level) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "تتطلب هذه العملية صلاحية أعلى." },
        { status: 403 },
      ),
    };
  }
  return { session, response: null };
}

/**
 * Capability check that also honours a rank-based escape hatch.
 *
 * The notification inbox is granted to every operator through
 * `view_notifications`, but a deployment whose grant table runs behind the code
 * must not lock the executive tier out of its own inbox. The capability is
 * checked first, so an explicit grant always works even below the rank; the
 * rank only widens access, never narrows or replaces it.
 */
export async function authorizePermissionOrClearance(
  permission: Permission,
  minClearance: number,
): Promise<Authorization> {
  const session = await getServerSession();
  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "يلزم تسجيل الدخول." },
        { status: 401 },
      ),
    };
  }
  if (
    session.permissions.includes(permission) ||
    session.clearanceLevel >= minClearance
  ) {
    return { session, response: null };
  }
  return {
    session: null,
    response: NextResponse.json(
      { error: "لا تملك هذه الصلاحية." },
      { status: 403 },
    ),
  };
}

/**
 * Capability check for routes that accept any one of several equivalent grants
 * (for example `add_catalog` or the broader `edit_catalog`).
 */
export async function authorizeAny(
  permissions: readonly Permission[],
): Promise<Authorization> {
  const session = await getServerSession();
  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "يلزم تسجيل الدخول." },
        { status: 401 },
      ),
    };
  }
  if (!permissions.some((permission) => session.permissions.includes(permission))) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "لا تملك هذه الصلاحية." },
        { status: 403 },
      ),
    };
  }
  return { session, response: null };
}

export function actorFromSession(session: ActiveSession) {
  return {
    id: session.user.id,
    name: session.user.name,
    team: session.user.team,
  };
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof AccountsError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof MarketingError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof FieldOpsError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof CatalogError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof ImageQaError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof TaxonomyError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof OperationsError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof GovernanceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof MissingEnvError) {
    // Configuration is a deployment concern, not a client mistake: answer 503
    // with a neutral message and keep the missing key in the server log only.
    console.error(error);
    return NextResponse.json(
      { error: "الخدمة غير متاحة حالياً. حاول لاحقاً.", code: "UNAVAILABLE" },
      { status: 503 },
    );
  }
  if (error instanceof ZodError) {
    const first = error.errors[0];
    return NextResponse.json(
      {
        error: first
          ? `${first.path.join(".") || "input"}: ${first.message}`
          : "فشل التحقق من البيانات.",
        code: "VALIDATION",
      },
      { status: 422 },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "حدث خطأ غير متوقع في الخادم." },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
