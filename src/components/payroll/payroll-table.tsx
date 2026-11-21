"use client";

import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
import { currencyMoney } from "@/lib/accounts/format";
import { PAYROLL_ITEM_META } from "@/lib/payroll/types";
import type { Payslip } from "@/lib/payroll/store";

type PayrollTableProps = {
  payslips: Payslip[];
};

export function PayrollTable({ payslips }: PayrollTableProps) {
  return (
    <div className="payroll-table-wrap">
      <table className="payroll-table">
        <thead>
          <tr>
            <th>المشغّل</th>
            <th>المساهمة</th>
            {Object.entries(PAYROLL_ITEM_META).map(([type, meta]) => (
              <th key={type}>{meta.label}</th>
            ))}
            <th>الصافي</th>
          </tr>
        </thead>
        <tbody>
          {payslips.map(({ profile, contribution, result }) => (
            <tr key={profile.userId}>
              <td>
                <strong>{profile.userName}</strong>
                <span>{profile.title}</span>
              </td>
              <td dir="ltr">
                {currencyMoney(contribution, profile.currency)}
              </td>
              {Object.keys(PAYROLL_ITEM_META).map((type) => {
                const amount = result.items
                  .filter((entry) => entry.type === type)
                  .reduce((total, entry) => total + entry.amount, 0);
                return (
                  <td key={type} dir="ltr">
                    {amount > 0
                      ? currencyMoney(amount, profile.currency)
                      : "—"}
                  </td>
                );
              })}
              <td dir="ltr" className="payroll-net">
                {currencyMoney(result.net, profile.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PayrollSummary({ payslips }: PayrollTableProps) {
  const currency = payslips[0]?.profile.currency ?? "EGP";
  const gross = payslips.reduce((total, slip) => total + slip.result.gross, 0);
  const net = payslips.reduce((total, slip) => total + slip.result.net, 0);
  const settled = payslips.filter((slip) => slip.result.net > 0).length;

  return (
    <Widget
      eyebrow="الرواتب"
      title="مسير الشهر"
      span={12}
      badge={<span className="badge badge-gold">{payslips.length} مشغّل</span>}
    >
      <div className="bi-stat-cluster bi-stat-cluster-row">
        <WidgetStat
          label="إجمالي الاستحقاقات"
          value={currencyMoney(gross, currency)}
          detail="قبل الخصومات"
          tone="purple"
        />
        <WidgetDivider />
        <WidgetStat
          label="صافي المسير"
          value={currencyMoney(net, currency)}
          detail="بعد كل الخصومات"
          tone="green"
        />
        <WidgetDivider />
        <WidgetStat
          label="كشوف مستحقة"
          value={`${settled}`}
          detail="مشغّلون بصافي موجب"
        />
      </div>
    </Widget>
  );
}
