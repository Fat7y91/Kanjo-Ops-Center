import { NextResponse } from "next/server";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { loadClearingReport } from "@/lib/operations/clearing-report-service";
import type { ClearingReportKind } from "@/lib/operations/clearing-report";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(request: Request) {
  const { session, response } = await authorizeAny([
    "view_clearinghouse",
    "settle_clearinghouse",
    "settle_clearinghouse_partial",
  ]);
  if (!session) return response;

  const url = new URL(request.url);
  const rawKind = url.searchParams.get("kind");
  if (rawKind !== "collections" && rawKind !== "payables") {
    return NextResponse.json(
      { error: "نوع التقرير غير صالح.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  const cleanDay = (value: string | null) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const from = cleanDay(url.searchParams.get("from"));
  const to = cleanDay(url.searchParams.get("to"));
  const excludeParam = url.searchParams.get("excludeInternal");
  const excludeInternal = excludeParam === "1" || excludeParam === "true";

  try {
    const report = await loadClearingReport(
      rawKind as ClearingReportKind,
      { from, to },
      excludeInternal,
    );
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
