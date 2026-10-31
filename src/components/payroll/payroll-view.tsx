"use client";

import { useState } from "react";

import { PayrollSummary, PayrollTable } from "@/components/payroll/payroll-table";
import { Widget } from "@/components/bi/widget";
import { SelectMenu } from "@/components/ui/select-menus";
import { currencyMoney } from "@/lib/accounts/format";
import type { Payslip } from "@/lib/payroll/store";

type PayrollViewProps = {
  payslips: Payslip[];
};

export function PayrollView({ payslips }: PayrollViewProps) {
  const [selectedId, setSelectedId] = useState(payslips[0]?.profile.userId ?? "");
  const selected = payslips.find(
    (slip) => slip.profile.userId === selectedId,
  );

  return (
    <div className="payroll-view">
      <PayrollSummary payslips={payslips} />

      <PayrollTable payslips={payslips} />

      {selected ? (
        <Widget
          eyebrow="تفصيل الكشف"
          title={selected.profile.userName}
          span={12}
          badge={
            <div className="payroll-select">
              <SelectMenu
                value={selectedId}
                onChange={setSelectedId}
                options={payslips.map((slip) => ({
                  value: slip.profile.userId,
                  label: slip.profile.userName,
                }))}
              />
            </div>
          }
        >
          <ul className="payslip-lines">
            {selected.result.items.map((item) => (
              <li key={`${item.type}-${item.note}`}>
                <span>{item.label}</span>
                {item.note ? <em>{item.note}</em> : null}
                <strong dir="ltr">
                  {item.signed ? "" : "−"}
                  {currencyMoney(item.amount, selected.profile.currency)}
                </strong>
              </li>
            ))}
          </ul>
          <div className="payslip-total">
            <span>الصافي المستحق</span>
            <strong dir="ltr">
              {currencyMoney(selected.result.net, selected.profile.currency)}
            </strong>
          </div>
        </Widget>
      ) : null}
    </div>
  );
}
