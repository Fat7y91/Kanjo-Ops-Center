import { NextResponse } from "next/server";

import { apiError } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { loadCapitalBoard, receiptUrl } from "@/lib/profile/capital-service";
import { listPayoutMethods } from "@/lib/profile/repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Treasury review payload for `/admin/finance/reviews`.
 *
 * The page shell is static; this controller owns the queue read, the treasury
 * account list and the short-lived receipt URLs. Rank alone is not enough: the
 * same full-book capabilities that `app.can_manage_treasury()` requires decide
 * who may review a capital deposit or payout destination.
 */
const TREASURY_PERMISSIONS = ["view_bank_balances", "add_bank_account"] as const;

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }
  if (
    !TREASURY_PERMISSIONS.some((permission) =>
      session.permissions.includes(permission),
    )
  ) {
    return NextResponse.json(
      { error: "لا تملك صلاحية مراجعة الاعتمادات." },
      { status: 403 },
    );
  }

  try {
    const [board, payouts] = await Promise.all([
      loadCapitalBoard({ founderId: null, canDecide: true }).catch(() => ({
        deposits: [],
        accounts: [],
      })),
      listPayoutMethods().catch(() => []),
    ]);

    // Reviewers must see what they are approving. Receipts are private, so each
    // pending deposit gets its own short-lived signed URL.
    const receiptUrls: Record<string, string> = {};
    await Promise.all(
      board.deposits
        .filter((deposit) => deposit.status === "pending")
        .map(async (deposit) => {
          const url = await receiptUrl(deposit).catch(() => null);
          if (url) receiptUrls[deposit.id] = url;
        }),
    );

    return NextResponse.json(
      {
        deposits: board.deposits,
        payouts,
        accounts: board.accounts,
        receiptUrls,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
