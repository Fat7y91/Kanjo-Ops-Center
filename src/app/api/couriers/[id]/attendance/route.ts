import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { apiError, authorize, authorizeAny, readJson } from "@/lib/auth/api";
import {
  clearAttendance,
  loadAttendance,
  saveAttendance,
} from "@/lib/couriers/attendance-service";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type RouteContext = { params: Promise<{ id: string }> };

/** Mirrors the `/couriers` nav module so the details modal can read overrides. */
const COURIERS_MODULE = permissionsForModule("/couriers");

/**
 * Attendance changes the courier balance, the settlement book and the P&L base.
 * Drop every server-cached view that renders those numbers before replying.
 */
function revalidateAttendanceViews() {
  for (const path of [
    "/couriers",
    "/finance/clearinghouse",
    "/overview",
    "/payroll",
  ]) {
    revalidatePath(path);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { session, response } = await authorizeAny(COURIERS_MODULE);
  if (!session) return response;

  try {
    const { id } = await context.params;
    const attendance = await loadAttendance(id);
    return NextResponse.json(
      { attendance },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { session, response } = await authorize("manage_couriers");
  if (!session) return response;

  try {
    const { id } = await context.params;
    const attendance = await saveAttendance(id, await readJson(request), session.user.id);
    revalidateAttendanceViews();
    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { session, response } = await authorize("manage_couriers");
  if (!session) return response;

  try {
    const { id } = await context.params;
    const day = new URL(request.url).searchParams.get("day") ?? "";
    await clearAttendance(id, day);
    revalidateAttendanceViews();
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
