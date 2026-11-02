import { PageHeader } from "@/components/ui/page-header";
import { ClearinghouseBoard } from "@/components/operations/clearinghouse-board";
import { requireAnyPermission } from "@/lib/auth/guard";
import { loadClearinghouse } from "@/lib/operations/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function ClearinghousePage() {
  // Reading and settling are separate capabilities: a reviewer may open the
  // book without being able to release money, and a settler must still see it.
  await requireAnyPermission(["view_clearinghouse", "settle_clearinghouse"]);

  const board = await loadClearinghouse("pending").catch(() => ({
    rows: [],
    payables: [],
    receivables: [],
  }));

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="المقاصة"
        description="مستحقات التجار والمناديب ومديونياتهم، منفصلة عن أرصدة الخزينة."
      />

      <ClearinghouseBoard
        initialRows={board.rows}
        initialPayables={board.payables}
        initialReceivables={board.receivables}
      />
    </>
  );
}
