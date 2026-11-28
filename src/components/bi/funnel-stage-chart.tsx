"use client";

import type { FunnelStep } from "@/lib/bi/select";
import { BI_DEAL_STAGE_META, type BiDealStage } from "@/lib/bi/types";

type FunnelStageChartProps = {
  steps: FunnelStep[];
  onSelect: (stage: BiDealStage) => void;
  activeStage?: BiDealStage | null;
};

const STAGE_COLORS: Record<BiDealStage, string> = {
  visited: "#7c3aed",
  no_contract: "#b91c1c",
  provisional: "#d4a017",
  final: "#15803d",
  signed: "#230535",
};

const STAGE_HINTS: Record<BiDealStage, string> = {
  visited: "كل التجار المطابقين للفلاتر",
  no_contract: "زيارة بلا اتفاق",
  provisional: "اتفاق مبدئي مع التاجر",
  final: "شروط نهائية قبل التوقيع",
  signed: "عقود موقّعة",
};

const PCT = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  style: "percent",
  maximumFractionDigits: 1,
});

/**
 * Merchant lifecycle distribution.
 *
 * The visited row is the population total (100%); the four outcome stages are
 * mutually exclusive and their shares cumulatively describe the whole base, so
 * every bar is measured against the same denominator and reads honestly at a
 * glance. Each row stays a real button so a stage is a keyboard-reachable drill
 * target.
 */
export function FunnelStageChart({
  steps,
  onSelect,
  activeStage,
}: FunnelStageChartProps) {
  const visited = steps.find((step) => step.stage === "visited")?.count ?? 0;
  const isEmpty = visited === 0;

  if (isEmpty) {
    return <p className="bi-chart-empty">لا توجد تجار في النطاق المحدد بعد.</p>;
  }

  return (
    <ol className="bi-funnel">
      {steps.map((step) => {
        const meta = BI_DEAL_STAGE_META[step.stage];
        const active = activeStage === step.stage;
        return (
          <li key={step.stage}>
            <button
              type="button"
              className={`bi-funnel-step${active ? " is-active" : ""}`}
              onClick={() => onSelect(step.stage)}
              aria-label={`عرض تفاصيل مرحلة ${meta.label}: ${step.count} تاجر`}
            >
              <span className="bi-funnel-head">
                <span
                  className="bi-legend-dot"
                  style={{ background: STAGE_COLORS[step.stage] }}
                />
                <span className="bi-funnel-label">{meta.label}</span>
                <strong className="bi-funnel-count">{step.count}</strong>
                <span className="bi-funnel-share">{PCT.format(step.share)}</span>
              </span>
              <span className="bi-funnel-track" aria-hidden="true">
                <span
                  className="bi-funnel-fill"
                  style={{
                    width: `${Math.max(step.share * 100, 1.5)}%`,
                    background: STAGE_COLORS[step.stage],
                  }}
                />
              </span>
              <span className="bi-funnel-hint">{STAGE_HINTS[step.stage]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
