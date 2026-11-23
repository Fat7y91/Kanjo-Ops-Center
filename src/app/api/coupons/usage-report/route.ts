import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { CouponsError } from "@/lib/coupons/errors";
import { parseCouponUsageReportRows } from "@/lib/coupons/usage-report";
import { loadDeliveredCouponUsage } from "@/lib/coupons/delivered-usage-server";
import {
  listCouponUsageReportRows,
  replaceCouponUsageReportRows,
} from "@/lib/coupons/usage-report-repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const REPORT_PERMISSIONS = ["view_overview_finance", "manage_coupons"] as const;

/** Imported coupon usage snapshot for the executive dashboard. */
export async function GET() {
  const { session, response } = await authorizeAny([...REPORT_PERMISSIONS]);
  if (!session) return response;

  try {
    const [rows, delivered] = await Promise.all([
      listCouponUsageReportRows(),
      loadDeliveredCouponUsage(),
    ]);
    return NextResponse.json(
      { rows, delivered },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Replaces the saved snapshot for every code in the uploaded report.
 *
 * The browser parses the CSV for preview; the server re-parses the same rows
 * with the same pure function, so a tampered payload cannot bypass validation.
 */
export async function POST(request: Request) {
  const { session, response } = await authorizeAny([...REPORT_PERMISSIONS]);
  if (!session) return response;

  try {
    const payload = (await readJson(request)) as {
      rows?: unknown;
      fileName?: unknown;
    };
    if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
      throw new CouponsError(
        "EMPTY_REPORT",
        "الملف لا يحتوي على صفوف.",
        422,
      );
    }
    if (payload.rows.length > 5000) {
      throw new CouponsError(
        "TOO_MANY_ROWS",
        "الحد الأقصى 5000 صف في الملف الواحد.",
        422,
      );
    }

    const parsed = parseCouponUsageReportRows(
      payload.rows as Record<string, unknown>[],
    );
    if (parsed.rows.length === 0) {
      throw new CouponsError(
        "NO_VALID_ROWS",
        "لا توجد صفوف صالحة في الملف.",
        422,
      );
    }

    const sourceFile =
      typeof payload.fileName === "string" && payload.fileName.trim() !== ""
        ? payload.fileName.trim().slice(0, 200)
        : null;
    const written = await replaceCouponUsageReportRows(
      parsed.rows,
      sourceFile,
    );

    return NextResponse.json({
      summary: {
        parsed: payload.rows.length,
        written,
        duplicates: parsed.duplicates,
        issues: parsed.issues,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
