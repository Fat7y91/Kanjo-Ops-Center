import { PageHeader } from "@/components/ui/page-header";
import { ClearinghouseBoard } from "@/components/operations/clearinghouse-board";
import { requireAnyPermission } from "@/lib/auth/guard";
import { loadClearinghouse } from "@/lib/operations/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function ClearinghousePage() {
  // Reading and settling are separate capabilities: a reviewer may open the
  // book without being able to release money, and a settler must still see it.
  const session = await requireAnyPermission([
    "view_clearinghouse",
    "settle_clearinghouse",
    "settle_clearinghouse_partial",
  ]);
  const canViewInternalStaffAccounts = session.permissions.includes(
    "view_internal_staff_accounts",
  );

  const board = await loadClearinghouse(canViewInternalStaffAccounts).catch(
    () => ({
      accounts: [],
      payables: [],
      receivables: [],
      operations: [],
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="المستحقات"
        description="أرصدة التجار ومناديب التوصيل المستخرجة من دفتر اليومية، مع تسديد أو تحصيل كامل أو جزئي."
      />

      <ClearinghouseBoard
        initialAccounts={board.accounts}
        initialPayables={board.payables}
        initialReceivables={board.receivables}
        initialOperations={board.operations}
        canViewInternalStaffAccounts={canViewInternalStaffAccounts}
      />
    </>
  );
}
