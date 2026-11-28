import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import {
  insertArchivedReport,
  listArchivedReports,
} from "@/lib/archived-reports/repository";
import { archivedReportInputSchema } from "@/lib/archived-reports/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** The archived-report browser. */
export async function GET() {
  const { session, response } = await authorize("view_archived_reports");
  if (!session) return response;

  try {
    const reports = (await listArchivedReports()) ?? [];
    return NextResponse.json(
      { reports },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Archives one visit report snapshot with its reason.
 *
 * `app.visit_reports` is append-only, so this does not delete the canonical
 * row: it records that the operator pulled it out of the live timeline, and the
 * field-ops UI hides it while the archive row exists.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("manage_archived_reports");
  if (!session) return response;

  try {
    const input = archivedReportInputSchema.parse(await readJson(request));
    const report = await insertArchivedReport({
      taskId: input.taskId ?? null,
      merchantId: input.merchantId,
      taskName: input.taskName,
      report: input.report,
      archivedBy: session.user.id,
      archivedByName: session.user.name,
      reason: input.reason,
      occurredAt: input.occurredAt,
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
