import { CapitalReviewLoader } from "@/components/profile/capital-review-loader";
import { requireAnyPermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Treasury review shell for founder capital and payout destinations.
 *
 * Rank alone is not enough: this surface follows the same full-book capability
 * that `app.can_manage_treasury()` uses, because a deposit-only operator must
 * not decide where money lands. The queue and receipt URLs are fetched by the
 * island so the Edge render only authorizes.
 */
const TREASURY_PERMISSIONS = ["view_bank_balances", "add_bank_account"] as const;

export default async function CapitalReviewPage() {
  const session = await requireAnyPermission([...TREASURY_PERMISSIONS]);

  return <CapitalReviewLoader currentUserId={session.user.id} />;
}
