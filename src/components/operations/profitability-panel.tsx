"use client";

import { useEffect, useState } from "react";

import { ProfitabilityWaterfall } from "@/components/bi/profitability-waterfall";
import { useProfitabilityExport } from "@/components/bi/use-profitability-export";
import type { EndpointState } from "@/components/data/use-endpoint-data";
import { Button } from "@/components/ui/button";
import { ToggleField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import type { ProfitabilitySummary } from "@/lib/bi/profitability";

const ALL = "";

type ProfitabilityState = EndpointState<ProfitabilitySummary> & {
  reload: () => void;
};

type ProfitabilityPanelProps = {
  state: ProfitabilityState;
  cityId: string | null;
  onCityChange: (cityId: string | null) => void;
  periodLabel: string;
  excludeInternalStaff: boolean;
  onExcludeInternalStaffChange: (next: boolean) => void;
};

/**
 * Settlement-screen order P&L panel.
 *
 * The board owns the period and the city slice, so the export and the card read
 * the same numbers. Cities are kept after the first successful load: changing a
 * filter must not make the control disappear while the next slice is fetched.
 */
export function ProfitabilityPanel({
  state,
  cityId,
  onCityChange,
  periodLabel,
  excludeInternalStaff,
  onExcludeInternalStaffChange,
}: ProfitabilityPanelProps) {
  const [knownCities, setKnownCities] = useState<
    { id: string; name: string }[]
  >([]);
  const exporter = useProfitabilityExport();

  useEffect(() => {
    if (state.status === "ready") setKnownCities(state.data.cities);
  }, [state]);

  const cityOptions = [
    { value: ALL, label: "كل المدن" },
    ...knownCities.map((city) => ({ value: city.id, label: city.name })),
  ];

  return (
    <section className="panel profitability-panel" aria-label="ملخص ربحية الطلبات">
      <div className="panel-head profitability-panel-head">
        <div>
          <p className="eyebrow">المالية</p>
          <h2>ملخص ربحية الطلبات</h2>
          <span className="muted">
            من الطلبات المسلّمة ودفتر اليومية · {periodLabel}
          </span>
        </div>
        <div className="profitability-controls">
          <ToggleField
            label="استبعاد مستحقات المناديب الداخليين (ZEMBAWY)"
            checked={excludeInternalStaff}
            onChange={onExcludeInternalStaffChange}
          />
          {knownCities.length > 0 ? (
            <SelectMenu
              label="المدينة"
              value={cityId ?? ALL}
              onChange={(value) =>
                onCityChange(value === ALL ? null : value)
              }
              options={cityOptions}
            />
          ) : null}
          {state.status === "ready" ? (
            <>
              <span className="badge badge-gold">
                {state.data.orders} طلب · EGP
              </span>
              <Button
                size="sm"
                variant="quiet"
                disabled={exporter.busy}
                onClick={() =>
                  void exporter.exportSummary(state.data, periodLabel)
                }
              >
                {exporter.busy ? "جارٍ التصدير…" : "تصدير Excel"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {exporter.error ? <p className="form-error">{exporter.error}</p> : null}

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
    </section>
  );
}
