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
  }));

  return (
    <>
      <PageHeader
        eyebrow="المقاصة والعمليات"
        title="تسجيل العمليات"
        description="تسجيل الطلبات المنفذة وتوجيه قيود المستحقات للتجار والمناديب."
      />

      <OperationLogForm
        couriers={board.couriers}
        merchants={board.merchants}
        initialOperations={board.operations}
      />
    </>
  );
}
