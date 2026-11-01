import { PageHeader } from "@/components/ui/page-header";
import { CapitalReviewBoard } from "@/components/profile/capital-review-board";
import { requireAnyPermission } from "@/lib/auth/guard";
import { loadCapitalBoard, receiptUrl } from "@/lib/profile/capital-service";
import { listPayoutMethods } from "@/lib/profile/repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Treasury review for founder capital and payout destinations.
 *
 * Rank alone is not enough: this surface follows the same full-book capability
 * that `app.can_manage_treasury()` and `resolveTreasuryAccess()` use, because a
 * deposit-only operator must not decide where money lands.
 */
const TREASURY_PERMISSIONS = ["view_bank_balances", "add_bank_account"] as const;

export default async function CapitalReviewPage() {
  const session = await requireAnyPermission([...TREASURY_PERMISSIONS]);

  const [board, payouts] = await Promise.all([
    loadCapitalBoard({ founderId: null, canDecide: true }).catch(() => ({
      deposits: [],
      accounts: [],
    })),
    listPayoutMethods().catch(() => []),
  ]);

  // Reviewers must be able to see what they are approving. Receipts are
  // private, so each pending deposit gets its own short-lived signed URL.
  const receiptUrls: Record<string, string> = {};
  await Promise.all(
    board.deposits
      .filter((deposit) => deposit.status === "pending")
      .map(async (deposit) => {
        const url = await receiptUrl(deposit).catch(() => null);
        if (url) receiptUrls[deposit.id] = url;
      }),
  );

  const pending = board.deposits.filter(
    (deposit) => deposit.status === "pending",
  ).length;
  const pendingPayouts = payouts.filter(
    (payout) => payout.status === "pending",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="اعتماد رأس المال وبيانات الصرف"
        description="مراجعة الإيداعات الرأسمالية للمؤسسين واعتماد وجهات الصرف. الاعتماد يقيّد الحركة في الخزينة مباشرة."
        actions={
          <span className="badge badge-gold">
            {pending + pendingPayouts} بند بانتظار القرار
          </span>
        }
      />

      <CapitalReviewBoard
        initialDeposits={board.deposits}
        initialPayouts={payouts}
        accounts={board.accounts}
        receiptUrls={receiptUrls}
        currentUserId={session.user.id}
      />
    </>
  );
}
