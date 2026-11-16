"use client";

import { MoneyValue } from "@/components/bi/money-value";
import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
import type { FinanceSummary } from "@/lib/bi/select";
import type { BiTreasury } from "@/lib/bi/types";

type FinanceSectionProps = {
  finance: FinanceSummary;
  treasury: BiTreasury[];
  onDrill: (id: string) => void;
};

const EMPTY: BiTreasury = {
  currency: "SAR",
  deposits: 0,
  expenses: 0,
  balance: 0,
  pendingPayroll: 0,
};

/**
 * Financial widget.
 *
 * Every headline card is a bank position, read from the immutable ledger in one
 * currency at a time. The Saudi and Egyptian banks are separate treasuries, so
 * they get their own rows: no figure ever adds riyals to pounds. Contract
 * commissions are EGP and sit with the Egyptian row.
 */
export function FinanceSection({
  finance,
  treasury,
  onDrill,
}: FinanceSectionProps) {
  const sar = treasury.find((row) => row.currency === "SAR") ?? EMPTY;
  const egp = treasury.find((row) => row.currency === "EGP");

  return (
    <Widget
      eyebrow="المالية"
      title="الموقف المالي"
      span={4}
      badge={<span className="badge badge-gold">الخزينة · SAR + EGP</span>}
    >
      <div className="bi-treasury">
        <p className="bi-treasury-label">البنك السعودي · SAR</p>
        <div className="bi-stat-cluster bi-stat-cluster-row">
          <WidgetStat
            label="الرصيد الحالي"
            value={<MoneyValue value={sar.balance} currency="SAR" />}
            detail="إيداعات ناقص المصروفات"
            tone={sar.balance >= 0 ? "green" : "red"}
            onOpen={() => onDrill("accounts-balance")}
          />
          <WidgetDivider />
          <WidgetStat
            label="الإيداعات"
            value={<MoneyValue value={sar.deposits} currency="SAR" />}
            detail="إجمالي الحركات الواردة"
            tone="purple"
            onOpen={() => onDrill("accounts-balance")}
          />
          <WidgetDivider />
          <WidgetStat
            label="المصروفات"
            value={<MoneyValue value={sar.expenses} currency="SAR" />}
            detail={
              sar.deposits === 0
                ? "لا إيداعات بعد"
                : `${Math.round((sar.expenses / sar.deposits) * 100)}% من الإيداعات`
            }
            tone="red"
            progress={sar.deposits === 0 ? 0 : sar.expenses / sar.deposits}
            onOpen={() => onDrill("accounts-expenses")}
          />
          <WidgetDivider />
          <WidgetStat
            label="رواتب مستحقة"
            value={<MoneyValue value={sar.pendingPayroll} currency="SAR" />}
            detail="لم تُصرف بعد"
            tone={sar.pendingPayroll > 0 ? "gold" : "default"}
            onOpen={() => onDrill("finance-pending")}
          />
        </div>
      </div>

      <div className="bi-treasury">
        <p className="bi-treasury-label">البنك المصري · EGP</p>
        <div className="bi-stat-cluster bi-stat-cluster-row">
          <WidgetStat
            label="الرصيد الحالي"
            value={
              <MoneyValue value={egp?.balance ?? 0} currency="EGP" />
            }
            detail="إيداعات ناقص المصروفات"
            tone={(egp?.balance ?? 0) >= 0 ? "green" : "red"}
            onOpen={() => onDrill("accounts-balance")}
          />
          <WidgetDivider />
          <WidgetStat
            label="الإيداعات"
            value={
              <MoneyValue value={egp?.deposits ?? 0} currency="EGP" />
            }
            detail="إجمالي الحركات الواردة"
            tone="purple"
            onOpen={() => onDrill("accounts-balance")}
          />
          <WidgetDivider />
          <WidgetStat
            label="رواتب مستحقة"
            value={
              <MoneyValue value={egp?.pendingPayroll ?? 0} currency="EGP" />
            }
            detail="لم تُصرف بعد"
            tone={(egp?.pendingPayroll ?? 0) > 0 ? "gold" : "default"}
            onOpen={() => onDrill("finance-pending")}
          />
          <WidgetDivider />
          <WidgetStat
            label="عمولات محصّلة"
            value={<MoneyValue value={finance.collected} currency="EGP" />}
            detail={`${finance.signedCount} عقد موقّع`}
            tone="gold"
            onOpen={() => onDrill("finance-collected")}
          />
        </div>
      </div>
    </Widget>
  );
}
