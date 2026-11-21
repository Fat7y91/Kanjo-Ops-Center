import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { decidePayoutMethod } from "@/lib/profile/repository";
import { ProfileError, fromDatabaseError } from "@/lib/profile/errors";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Records a review decision on an operator payout method.
 *
 * Gated by the full treasury capabilities: a payout destination is how salary
 * leaves the company, so it follows `app.can_manage_treasury()`, the same rule
 * the RLS policy applies. An operator cannot review their own method — the SQL
 * trigger raises `PAYOUT_SELF_REVIEW` and the error is passed through
 * unchanged.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorizeAny([
    "view_bank_balances",
    "add_bank_account",
  ]);
  if (!session) return response;

  const { id } = await context.params;
  const body = (await readJson(request)) as { status?: unknown };
  const status = body.status;

  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json(
      { error: "قرار غير صالح.", code: "INVALID_DECISION" },
      { status: 422 },
    );
  }

  try {
    const payoutMethod = await decidePayoutMethod(id, status, session.user.id);
    return NextResponse.json({ payoutMethod });
  } catch (error) {
    if (error instanceof ProfileError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) {
      return NextResponse.json(
        { error: mapped.message, code: mapped.code },
        { status: mapped.status },
      );
    }
    return apiError(error);
  }
}
