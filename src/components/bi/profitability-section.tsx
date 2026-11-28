"use client";

import { ProfitabilityWaterfall } from "@/components/bi/profitability-waterfall";
import { useProfitabilityExport } from "@/components/bi/use-profitability-export";
import { Widget } from "@/components/bi/widget";
import type { EndpointState } from "@/components/data/use-endpoint-data";
import { Button } from "@/components/ui/button";
import type { ProfitabilitySummary } from "@/lib/bi/profitability";

type ProfitabilityState = EndpointState<ProfitabilitySummary> & {
  reload: () => void;
};

/**
 * Executive order P&L card.
 *
 * The dashboard owns the window and the internal-staff switch so the headline
 * tile and this waterfall cannot disagree. The arithmetic happens on the server
 * from delivered orders and posted attendance entries.
 */
export function ProfitabilitySection({
  state,
  label,
}: {
  state: ProfitabilityState;
  label: string;
}) {
  const exporter = useProfitabilityExport();

  const badge =
    state.status === "ready"
      ? `${state.data.orders} طلب · ${label}`
      : `EGP · ${label}`;

  return (
    <Widget
      eyebrow="الربحية"
      title="ملخص ربحية الطلبات"
      span={12}
      badge={<span className="badge badge-gold">{badge}</span>}
    >
      {state.status === "ready" ? (
        <div className="profitability-export">
          <Button
            size="sm"
            variant="quiet"
            disabled={exporter.busy}
            onClick={() => void exporter.exportSummary(state.data, label)}
          >
            {exporter.busy ? "جارٍ التصدير…" : "تصدير Excel"}
          </Button>
          {exporter.error ? (
            <p className="form-error">{exporter.error}</p>
          ) : null}
        </div>
      ) : null}

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
