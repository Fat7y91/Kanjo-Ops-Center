"use client";

import { useRouter } from "next/navigation";

import { SelectMenu } from "@/components/ui/select-menus";
import { shortDate } from "@/lib/accounts/format";
import { operationMoney } from "@/lib/operations/format";
import type { EmployeeOperationRow } from "@/lib/operations/kpi-types";

type OperationsKpiTableProps = {
  rows: EmployeeOperationRow[];
  month: string;
  monthOptions: { value: string; label: string }[];
};

export function OperationsKpiTable({
  rows,
  month,
  monthOptions,
}: OperationsKpiTableProps) {
  const router = useRouter();

  return (
    <section className="panel">
      <div className="table-toolbar">
        <div className="kpi-month-picker">
          <span className="muted">الشهر</span>
          <SelectMenu
            ariaLabel="الشهر"
            value={month}
            options={monthOptions}
            onChange={(value) => router.push(`/operations/kpi?month=${value}`)}
          />
        </div>
        <span className="badge" aria-live="polite">
          {rows.length} موظف
        </span>
      </div>

      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>المسمى الوظيفي</th>
              <th>عدد العمليات</th>
              <th>قيمة الطلبات</th>
              <th>العمولات</th>
              <th>مستحقات مناديب التوصيل</th>
              <th>آخر عملية</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <p className="muted">لا توجد عمليات مسجلة في هذا الشهر.</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.title || "—"}</td>
                  <td dir="ltr">{row.operationCount}</td>
                  <td dir="ltr">{operationMoney(row.orderValueTotal, "EGP")}</td>
                  <td dir="ltr">{operationMoney(row.commissionTotal, "EGP")}</td>
                  <td dir="ltr">{operationMoney(row.courierCutTotal, "EGP")}</td>
                  <td>
                    {row.lastLoggedAt ? shortDate(row.lastLoggedAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
