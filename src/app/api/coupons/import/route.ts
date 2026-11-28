import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { importCoupons } from "@/lib/coupons/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Bulk coupon import from the approved CSV export.
 *
 * The client parses the CSV in the browser (so a large file never streams
 * through the API) and posts the normalised rows as JSON. The server re-parses
 * with the same pure functions, converts money to minor units once, and writes
 * through the functional-index upsert, so a re-import updates rather than
 * duplicates. Gated by `manage_coupons`.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("manage_coupons");
  if (!session) return response;

  try {
    const payload = (await readJson(request)) as { rows?: unknown };
    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Record<string, unknown>[])
      : [];
    const summary = await importCoupons(rows);
    return NextResponse.json({ summary });
  } catch (error) {
    return apiError(error);
  }
}
