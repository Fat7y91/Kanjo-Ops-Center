import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { deleteArchivedReport } from "@/lib/archived-reports/repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Restores an archived report.
 *
 * This removes the archive row only; the canonical `app.visit_reports` history
 * was never touched, so the report reappears in the live timeline untouched.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { session, response } = await authorize("manage_archived_reports");
  if (!session) return response;

  const { id } = await context.params;

  try {
    const removed = await deleteArchivedReport(id);
    if (!removed) {
      return NextResponse.json(
        { error: "التقرير المؤرشف غير موجود." },
        { status: 404 },
      );
    }
    return NextResponse.json({ restored: true });
  } catch (error) {
    return apiError(error);
  }
}
