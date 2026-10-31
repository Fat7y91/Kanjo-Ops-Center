import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerSession } from "@/lib/auth/server-session";
import { AccountsError } from "@/lib/accounts/store";
import { CatalogError } from "@/lib/catalog/store";
import { ImageQaError } from "@/lib/catalog/image-qa";
import { MarketingError } from "@/lib/marketing/store";
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
 * Capability check for routes that accept any one of several equivalent grants
 * (for example `create_products` or the broader `manage_catalog`).
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
