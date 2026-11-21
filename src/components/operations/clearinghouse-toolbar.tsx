"use client";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  CLEARING_SORTS,
  CLEARING_SORT_LABEL,
  type ClearingPeriod,
  type ClearingPeriodState,
  type ClearingSort,
} from "@/lib/operations/clearinghouse-view";

const PERIOD_LABEL: Record<Exclude<ClearingPeriod, "custom">, string> = {
  all: "الكل",
  today: "اليوم",
  "7d": "آخر 7 أيام",
  month: "هذا الشهر",
};

const PRESETS = ["all", "today", "7d", "month"] as const;

type ClearinghouseToolbarProps = {
  period: ClearingPeriodState;
  onPeriod: (patch: Partial<ClearingPeriodState>) => void;
  sort: ClearingSort;
  onSort: (sort: ClearingSort) => void;
  onExport: () => void;
  exportBusy: boolean;
  exportError: string;
};

/**
 * Period, sort and export controls for the settlement book.
 *
 * Period presets mirror the way finance talks about a collection window; a
 * custom range unlocks the two date fields. The sort reorders the same filtered
 * slice the KPI cards summarise.
 */
export function ClearinghouseToolbar({
  period,
  onPeriod,
  sort,
  onSort,
  onExport,
  exportBusy,
  exportError,
}: ClearinghouseToolbarProps) {
  return (
    <div className="clearing-toolbar">
      <div className="clearing-toolbar-row">
        <div className="clearing-period" role="group" aria-label="فترة التسوية">
          {PRESETS.map((preset) => {
            const active = period.period === preset;
            return (
              <Button
                key={preset}
                size="sm"
                variant={active ? "primary" : "quiet"}
                aria-pressed={active}
                onClick={() => onPeriod({ period: preset })}
              >
                {PERIOD_LABEL[preset]}
              </Button>
            );
          })}
          <Button
            size="sm"
            variant={period.period === "custom" ? "primary" : "quiet"}
            aria-pressed={period.period === "custom"}
            onClick={() => onPeriod({ period: "custom" })}
          >
            فترة مخصصة
          </Button>
        </div>

        <SelectMenu
          className="clearing-sort"
          label="الترتيب"
          value={sort}
          onChange={(value) => onSort(value as ClearingSort)}
          options={CLEARING_SORTS.map((option) => ({
            value: option,
            label: CLEARING_SORT_LABEL[option],
          }))}
        />

        <Button
          size="sm"
          variant="quiet"
          disabled={exportBusy}
          onClick={onExport}
        >
          {exportBusy ? "جارٍ التصدير…" : "تصدير Excel"}
        </Button>
      </div>

      {period.period === "custom" ? (
        <div className="clearing-toolbar-row clearing-custom-range">
          <TextField
            label="من تاريخ"
            type="date"
            value={period.from}
            onChange={(event) => onPeriod({ from: event.target.value })}
          />
          <TextField
            label="إلى تاريخ"
            type="date"
            value={period.to}
            onChange={(event) => onPeriod({ to: event.target.value })}
          />
        </div>
      ) : null}

      {exportError ? <p className="form-error">{exportError}</p> : null}
    </div>
  );
}
