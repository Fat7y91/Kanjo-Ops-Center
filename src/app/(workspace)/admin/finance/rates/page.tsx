import { CommissionRatesLoader } from "@/components/admin/finance/commission-rates-loader";
import { requireMinClearance, requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Rank-gated like the SQL policies: `app.has_min_clearance(4)`. */
const FINANCE_CLEARANCE = 4;

/**
 * Commission rates shell.
 *
 * The rank and capability gates mirror the SQL policies and the PUT handler;
 * the schedule and city picker are fetched by the island so the Edge render no
 * longer reads `app.commission_rates`.
 */
export default async function FinanceRatesPage() {
  await requireMinClearance(FINANCE_CLEARANCE);
  await requirePermission("manage_commission_rates");

  return <CommissionRatesLoader />;
}
