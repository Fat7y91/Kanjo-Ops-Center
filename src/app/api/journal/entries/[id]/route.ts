import { NextResponse } from "next/server";

import { apiError, authorizeAny } from "@/lib/auth/api";
import { loadEntryVoucher } from "@/lib/journal/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * The voucher behind one ledger row.
 *
 * Every surface that lists a movement — the bank ledger, a merchant statement,
 * a courier statement — carries the journal entry id, and this route answers the
 * full entry: both sides, the party, the reason, the reference and a signed link
 * to the receipt. Gated by any capability that already lets a viewer read that
 * movement, so opening a voucher never widens access.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorizeAny([
    "view_journal",
    "view_clearinghouse",
    "view_bank_balances",
    "view_bank_transactions",
  ]);
  if (!session) return response;

  const { id } = await context.params;
  const entryId = id?.trim() ?? "";
  if (entryId === "") {
    return NextResponse.json(
      { error: "معرّف القيد مطلوب.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  try {
    const voucher = await loadEntryVoucher(entryId);
    return NextResponse.json(voucher, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
