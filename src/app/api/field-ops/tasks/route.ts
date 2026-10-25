import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { taskAssignSchema } from "@/lib/schemas/field-ops";
import {
  assignMerchantTask,
  tasksForViewer,
  today,
} from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, response } = await authorize("view_field_ops");
  if (!session) return response;

  return NextResponse.json(
    {
      tasks: tasksForViewer({
        team: session.user.team,
        canManageTasks: session.permissions.includes("manage_tasks"),
        date: today(),
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorize("manage_tasks");
  if (!session) return response;

  try {
    const input = taskAssignSchema.parse(await readJson(request));
    const result = assignMerchantTask(input, actorFromSession(session));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
