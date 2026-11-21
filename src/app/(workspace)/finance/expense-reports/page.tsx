import { ExpenseReportsIsland } from "@/components/accounts/expense-reports-island";
import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Expense reports shell.
 *
 * The guard mirrors the API: anyone who may read financials or manage expenses
 * can open the report, and the API repeats the check before returning a row.
 */
export default async function ExpenseReportsPage() {
  await requireModuleAccess("/finance/expense-reports");

  return (
    <ClientErrorBoundary
      title="تعذر عرض تقارير المصروفات"
      description="لم تكتمل قراءة المصروفات. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل التقارير"
    >
      <PageHeader
        eyebrow="المالية"
        title="تقارير المصروفات"
        description="إجمالي المصروفات موزّعاً على البنود التحليلية، بالجنيه والريال، مع تصفية بالفترة والبند."
      />
      <ExpenseReportsIsland />
    </ClientErrorBoundary>
  );
}
