import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError, readJson } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { listCities } from "@/lib/field-ops/store";
import { RbacDeniedError } from "@/lib/rbac/management";
import {
  createTeam,
  TeamError,
} from "@/lib/rbac/services/team-service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * City-owned field teams.
 *
 * The add-user dialog already receives the team catalogue from the server
 * render, so this controller only mints a team inside a city the caller
 * manages. A city manager reaches their own cities; an executive reaches all
 * of them (`app.can_manage_city()` mirrors the same rule in SQL).
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !session.permissions.includes("manage_permissions")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await readJson(request)) as { cityId?: unknown };
    const cityId = typeof body.cityId === "string" ? body.cityId.trim() : "";
    if (cityId && !listCities().some((city) => city.id === cityId)) {
      return NextResponse.json(
        { error: "مدينة غير معروفة.", code: "UNKNOWN_CITY" },
        { status: 422 },
      );
    }

    const team = await createTeam(session, body);
    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    if (error instanceof TeamError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof RbacDeniedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof ZodError) {
      const first = error.errors[0];
      return NextResponse.json(
        {
          error: first ? first.message : "فشل التحقق من البيانات.",
          code: "VALIDATION",
          path: first?.path,
        },
        { status: 422 },
      );
    }
    return apiError(error);
  }
}
