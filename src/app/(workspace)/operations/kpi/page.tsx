import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { OperationsKpiTable } from "@/components/operations/kpi-table";
import { requirePermission } from "@/lib/auth/guard";
import { monthLabel, recentMonthKeys } from "@/lib/kpi/calendar";
import { operationMoney } from "@/lib/operations/format";
import {
  loadOperationsKpiReport,
  normalizeMonth,
} from "@/lib/operations/kpi-service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type OperationsKpiPageProps = {
  searchParams: Promise<{ month?: string }>;
};

/**
 * Per-employee operations report.
 *
 * Reads the month from the query string, aggregates the append-only operation
 * log by the operator who entered each row, and hands a plain table to the
 * client. The payroll engine owns salary math; this screen is the evidence a
 * manager checks beside it.
 */
export default async function OperationsKpiPage({
  searchParams,
}: OperationsKpiPageProps) {
  await requirePermission("view_operations_kpi");

  const { month: monthParam } = await searchParams;
  const month = normalizeMonth(monthParam);
  const report = await loadOperationsKpiReport(month).catch(() => ({
    month,
    rows: [],
    totals: {
      operationCount: 0,
      orderValueTotal: 0,
      commissionTotal: 0,
      courierCutTotal: 0,
    },
  }));

  const monthOptions = recentMonthKeys(6).map((key) => ({
    value: key,
    label: monthLabel(key),
  }));

  return (
    <>
      <PageHeader
        eyebrow="المقاصة والعمليات"
        title="سجل أداء الموظفين"
        description="عدد العمليات المسجلة لكل موظف وقيمتها الشهرية، أساس حساب المؤشرات والرواتب."
        actions={
          <span className="badge badge-gold">
            {report.rows.length} موظف · {monthLabel(month)}
          </span>
        }
      />

      <section className="stat-grid">
        <StatCard
          label="إجمالي العمليات"
          value={String(report.totals.operationCount)}
          detail="عملية مسجلة في الشهر"
        />
        <StatCard
          label="قيمة الطلبات"
          value={operationMoney(report.totals.orderValueTotal, "EGP")}
          detail="إجمالي قيمة الطلبات المسجلة"
          tone="gold"
        />
        <StatCard
          label="إجمالي العمولات"
          value={operationMoney(report.totals.commissionTotal, "EGP")}
          detail="عمولات التجار المحتسبة"
          tone="green"
        />
        <StatCard
          label="مستحقات المناديب"
          value={operationMoney(report.totals.courierCutTotal, "EGP")}
          detail="حصص المناديب المحتسبة"
        />
      </section>

      <OperationsKpiTable
        rows={report.rows}
        month={month}
        monthOptions={monthOptions}
      />
    </>
  );
}
