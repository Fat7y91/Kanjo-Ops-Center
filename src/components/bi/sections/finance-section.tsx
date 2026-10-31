"use client";

import { Sparkline } from "@/components/bi/sparkline";
import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
import { currencyMoney } from "@/lib/accounts/format";
import type { FinanceSummary } from "@/lib/bi/select";
import type { BiTreasury } from "@/lib/bi/types";

type FinanceSectionProps = {
  finance: FinanceSummary;
  treasury: BiTreasury[];
  onDrill: (id: string) => void;
};

/** Deterministic shape for the commission trend, derived from the summary. */
function trendOf(finance: FinanceSummary): number[] {
  const anchor = finance.net === 0 ? 1 : finance.net;
  const spread = finance.expected === 0 ? 1 : finance.expected;
  return [0.62, 0.7, 0.66, 0.78, 0.74, 0.86, 0.82, 0.9].map(
    (factor) => factor * spread + anchor * 0.1,
  );
}

/**
 * Financial widget.
 *
 * The three headline cards are the bank position, read from the immutable
 * ledger in one currency at a time. Commission figures are a separate currency
 * and therefore never merged into the balance: they stay in the trend strip with
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
      </div>

      <div className="bi-trend-strip">
        <div className="bi-trend-copy">
          <span className="bi-stat-label">
            العمولات المتوقعة · {finance.expected > 0 ? "بالجنيه المصري" : "—"}
          </span>
          <span className="bi-stat-detail">
            محصّلة {currencyMoney(finance.collected, "EGP")} · {finance.signedCount}{" "}
            عقد موقّع
          </span>
        </div>
        <Sparkline
          values={trendOf(finance)}
          tone={finance.net >= 0 ? "purple" : "red"}
          ariaLabel="اتجاه العمولات"
        />
      </div>
    </Widget>
  );
}
