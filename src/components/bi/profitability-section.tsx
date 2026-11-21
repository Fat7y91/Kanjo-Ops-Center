"use client";

import { useMemo } from "react";

import { ProfitabilityWaterfall } from "@/components/bi/profitability-waterfall";
import { useProfitability } from "@/components/bi/use-profitability";
import { Widget } from "@/components/bi/widget";
import { Button } from "@/components/ui/button";
import { rangeStart } from "@/lib/bi/select";
import { BI_RANGE_LABELS, type BiRange } from "@/lib/bi/types";

/**
 * Executive order P&L card.
 *
 * The date window comes from the universal filter bar, and the city filter is
 * the same merchant-city slice every other order widget uses. The arithmetic
 * happens on the server from delivered orders and posted attendance entries.
 */
export function ProfitabilitySection({
  range,
  cityId,
}: {
  range: BiRange;
  cityId: string | null;
}) {
  const from = useMemo(
    () => rangeStart(range)?.toISOString().slice(0, 10) ?? null,
    [range],
  );
  const state = useProfitability(from, null, cityId);

  const badge =
    state.status === "ready"
      ? `${state.data.orders} طلب · ${BI_RANGE_LABELS[range]}`
      : `EGP · ${BI_RANGE_LABELS[range]}`;

  return (
    <Widget
      eyebrow="الربحية"
      title="ملخص ربحية الطلبات"
      span={12}
      badge={<span className="badge badge-gold">{badge}</span>}
    >
      {state.status === "loading" ? (
        <p className="bi-widget-empty">جارٍ حساب ربحية الطلبات…</p>
      ) : null}

      {state.status === "failed" ? (
        <div className="profitability-error">
          <p className="form-error">تعذر تحميل ملخص ربحية الطلبات.</p>
          <Button size="sm" variant="quiet" onClick={state.reload}>
            إعادة المحاولة
          </Button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <ProfitabilityWaterfall summary={state.data} />
      ) : null}
    </Widget>
  );
}
