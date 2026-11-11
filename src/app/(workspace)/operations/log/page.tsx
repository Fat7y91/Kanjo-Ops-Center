import { PageHeader } from "@/components/ui/page-header";
import { OperationLogForm } from "@/components/operations/operation-log-form";
import { requirePermission } from "@/lib/auth/guard";
import { loadOperationsBoard } from "@/lib/operations/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function OperationsLogPage() {
  await requirePermission("log_operations");

  const board = await loadOperationsBoard().catch(() => ({
    operations: [],
    couriers: [],
    merchants: [],
    coupons: [],
  }));

  // The service already degrades to an empty board, but a future repository
  // could return a partial shape. Normalise here so the client never receives
  // `undefined` for a list it iterates.
  const operations = Array.isArray(board.operations) ? board.operations : [];
  const couriers = Array.isArray(board.couriers) ? board.couriers : [];
  const merchants = Array.isArray(board.merchants) ? board.merchants : [];
  const coupons = Array.isArray(board.coupons) ? board.coupons : [];

  return (
    <>
      <PageHeader
        eyebrow="المقاصة والعمليات"
        title="تسجيل العمليات"
        description="تسجيل الطلبات المنفذة وتوجيه قيود المستحقات للتجار ومناديب التوصيل."
      />

      <OperationLogForm
        couriers={couriers}
        merchants={merchants}
        coupons={coupons}
        initialOperations={operations}
      />
    </>
  );
}
