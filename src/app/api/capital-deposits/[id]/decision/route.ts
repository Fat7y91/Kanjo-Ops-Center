import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { decideDeposit } from "@/lib/profile/capital-service";
import { ProfileError } from "@/lib/profile/errors";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Records a treasury decision on a capital deposit.
 *
 * Gated by the full treasury capabilities, the same rule the RLS update policy
 * applies through `app.can_manage_treasury()`. The self-review ban and the
 * ledger write happen inside the SQL trigger, in the same transaction as the
 * status change.
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

  try {
    const deposit = await decideDeposit(
      id,
      session.user.id,
      await readJson(request),
    );
    return NextResponse.json({ deposit });
  } catch (error) {
    if (error instanceof ProfileError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error);
  }
}
