import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerSession } from "@/lib/auth/server-session";
import { FieldOpsError } from "@/lib/field-ops/store";
import type { Permission } from "@/lib/rbac/permissions";
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
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }
  if (!session.permissions.includes(permission)) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "You do not have this capability." },
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
  if (error instanceof FieldOpsError) {
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
          : "Validation failed.",
        code: "VALIDATION",
      },
      { status: 422 },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "Unexpected server error." },
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
