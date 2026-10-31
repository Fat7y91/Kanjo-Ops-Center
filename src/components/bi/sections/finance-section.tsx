"use client";

import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
import { currencyMoney } from "@/lib/accounts/format";
import type { FinanceSummary } from "@/lib/bi/select";
import type { BiTreasury } from "@/lib/bi/types";

type FinanceSectionProps = {
  finance: FinanceSummary;
  treasury: BiTreasury[];
  onDrill: (id: string) => void;
};

/**
 * Financial widget.
 *
 * Every headline card is the bank position, read from the immutable ledger in
 * one currency at a time. Contract commissions are a separate currency and are
 * therefore never merged into the balance: they appear as their own card with
 * their own unit, so no sum ever adds riyals to pounds.
 */
export function FinanceSection({
  finance,
  treasury,
  onDrill,
}: FinanceSectionProps) {
  const primary =
    treasury[0] ??
    ({
      currency: "SAR",
      deposits: 0,
      expenses: 0,
      balance: 0,
      pendingPayroll: 0,
    } as BiTreasury);
  const bankCurrency = primary.currency;

  return (
    <Widget
      eyebrow="المالية"
      title="الموقف المالي"
      span={12}
      badge={<span className="badge badge-gold">الخزينة · {bankCurrency}</span>}
    >
      <div className="bi-stat-cluster bi-stat-cluster-row">
        <WidgetStat
          label="الرصيد الحالي"
          value={currencyMoney(primary.balance, bankCurrency)}
          detail="إيداعات ناقص المصروفات"
          tone={primary.balance >= 0 ? "green" : "red"}
          onOpen={() => onDrill("accounts-balance")}
        />
        <WidgetDivider />
        <WidgetStat
          label="الإيداعات"
          value={currencyMoney(primary.deposits, bankCurrency)}
          detail="إجمالي الحركات الواردة"
          tone="purple"
          onOpen={() => onDrill("accounts-balance")}
        />
        <WidgetDivider />
        <WidgetStat
          label="المصروفات"
          value={currencyMoney(primary.expenses, bankCurrency)}
          detail={
            primary.deposits === 0
              ? "لا إيداعات بعد"
              : `${Math.round((primary.expenses / primary.deposits) * 100)}% من الإيداعات`
          }
          tone="red"
          progress={
            primary.deposits === 0 ? 0 : primary.expenses / primary.deposits
          }
          onOpen={() => onDrill("accounts-expenses")}
        />
        <WidgetDivider />
        <WidgetStat
          label={`رواتب مستحقة (${bankCurrency})`}
          value={currencyMoney(primary.pendingPayroll, bankCurrency)}
          detail="لم تُصرف بعد"
          tone={primary.pendingPayroll > 0 ? "gold" : "default"}
          onOpen={() => onDrill("finance-pending")}
        />
        <WidgetDivider />
        <WidgetStat
          label="عمولات محصّلة (EGP)"
          value={currencyMoney(finance.collected, "EGP")}
          detail={`${finance.signedCount} عقد موقّع`}
          tone="gold"
          onOpen={() => onDrill("finance-collected")}
        />
      </div>
    </Widget>
  );
}
