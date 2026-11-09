import { NextResponse } from "next/server";

import { apiError, authorize } from "@/lib/auth/api";
import { loadOperationsKpiReport } from "@/lib/operations/kpi-service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Per-employee operations report for the requested month (`?month=YYYY-MM`). */
export async function GET(request: Request) {
  const { session, response } = await authorize("view_operations_kpi");
  if (!session) return response;

  try {
    const month = new URL(request.url).searchParams.get("month");
    const report = await loadOperationsKpiReport(month);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
