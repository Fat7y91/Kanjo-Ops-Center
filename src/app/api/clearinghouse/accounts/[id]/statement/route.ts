import { NextResponse } from "next/server";

import { apiError, authorize } from "@/lib/auth/api";
import { loadPartyStatement } from "@/lib/operations/read-service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Full statement of account for one merchant or courier ledger account.
 *
 * Gated by `view_clearinghouse`: the statement is management's reading of a
 * party's money, the same audience that reads the book. Every line carries its
 * date, reference and amount, so the response is printable as-is.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_clearinghouse");
  if (!session) return response;

  const { id } = await context.params;
  const accountId = id?.trim() ?? "";
  if (accountId === "") {
    return NextResponse.json(
      { error: "معرّف الحساب مطلوب.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  const url = new URL(request.url);
  const cleanDay = (value: string | null) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const from = cleanDay(url.searchParams.get("from"));
  const to = cleanDay(url.searchParams.get("to"));

  try {
    const statement = await loadPartyStatement(
      accountId,
      from || to ? { from, to } : null,
    );
    return NextResponse.json(statement, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
