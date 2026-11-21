import { NextResponse } from "next/server";

import {
  apiError,
  actorFromSession,
  authorize,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { taskAssignSchema } from "@/lib/schemas/field-ops";
import {
  assignMerchantTask,
  getMerchantById,
  tasksForViewer,
  today,
} from "@/lib/field-ops/store";
import { permissionsForModule } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Mirrors the `/field-ops` nav module: opening the board loads its tasks. */
const FIELD_OPS_MODULE = permissionsForModule("/field-ops");

export async function GET() {
  const { session, response } = await authorizeAny(FIELD_OPS_MODULE);
  if (!session) return response;

  const tasks = await tasksForViewer({
    team: session.user.team,
    canManageTasks: session.permissions.includes("assign_tasks"),
    date: today(),
  });

  return NextResponse.json(
    { tasks },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorize("assign_tasks");
  if (!session) return response;

  try {
    const input = taskAssignSchema.parse(await readJson(request));
    const merchant = await getMerchantById(input.merchantId);
    if (
      merchant &&
      !(await effectiveCityIds(session)).includes(merchant.cityId)
    ) {
      return NextResponse.json(
        { error: "هذا التاجر خارج نطاق مدنك.", code: "CITY_OUT_OF_SCOPE" },
        { status: 403 },
      );
    }
    const result = await assignMerchantTask(input, actorFromSession(session));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
