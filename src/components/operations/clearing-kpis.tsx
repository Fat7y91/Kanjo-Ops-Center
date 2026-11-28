import { operationMoney } from "@/lib/operations/format";

/**
 * The three headline figures above the party books. Presentational only: the
 * board derives the totals from the same account slice it renders below, so the
 * cards, the panels and the export cannot disagree.
 */
export function ClearingKpis({
  receivables,
  payables,
  net,
  currency,
}: {
  receivables: number;
  payables: number;
  net: number;
  currency: string;
}) {
  return (
    <div className="clearing-kpis">
      <div className="clearing-kpi clearing-kpi-positive">
        <span>إجمالي مستحق لنا</span>
        <strong dir="ltr">{operationMoney(receivables, currency)}</strong>
      </div>
      <div className="clearing-kpi clearing-kpi-negative">
        <span>إجمالي مستحق لهم</span>
        <strong dir="ltr">{operationMoney(payables, currency)}</strong>
      </div>
      <div
        className={`clearing-kpi ${
          net >= 0 ? "clearing-kpi-positive" : "clearing-kpi-negative"
        }`}
      >
        <span>
          الصافي النهائي {net >= 0 ? "(مستحق لنا)" : "(مستحق لهم)"}
        </span>
        <strong dir="ltr">{operationMoney(Math.abs(net), currency)}</strong>
      </div>
    </div>
  );
}
