"use client";

import {
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { BI_DEAL_STAGE_META, type BiDealStage } from "@/lib/bi/types";
import type { FunnelStep } from "@/lib/bi/select";

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

/**
 * Merchant lifecycle funnel.
 *
 * Recharts draws the trapezoids, while the legend below stays a set of real
 * buttons: that guarantees keyboard access and a clickable target per stage
 * regardless of how thin a funnel slice gets.
 */
export function FunnelStageChart({
  steps,
  onSelect,
  activeStage,
}: FunnelStageChartProps) {
  const data = steps.map((step) => ({
    stage: step.stage,
    name: BI_DEAL_STAGE_META[step.stage].label,
    count: step.count,
    fill: STAGE_COLORS[step.stage],
  }));

  return (
    <div className="bi-chart">
      <div className="bi-chart-canvas">
        <ResponsiveContainer width="100%" height={230}>
          <FunnelChart>
            <Tooltip
              formatter={(value) => [`${value} تاجر`, "العدد"]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--surface)",
                fontSize: 12,
              }}
            />
            <Funnel
              dataKey="count"
              data={data}
              isAnimationActive={false}
              onClick={(entry) => {
                const stage = (entry as { stage?: BiDealStage }).stage;
                if (stage) onSelect(stage);
              }}
            >
              <LabelList
                position="right"
                fill="var(--ink)"
                stroke="none"
                dataKey="name"
                fontSize={11}
              />
              <LabelList
                position="left"
                fill="var(--ink-soft)"
                stroke="none"
                dataKey="count"
                fontSize={11}
              />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      </div>

      <ul className="bi-legend">
        {steps.map((step) => {
          const meta = BI_DEAL_STAGE_META[step.stage];
          const active = activeStage === step.stage;
          return (
            <li key={step.stage}>
              <button
                type="button"
                className={`bi-legend-item${active ? " is-active" : ""}`}
                onClick={() => onSelect(step.stage)}
                aria-label={`عرض تفاصيل مرحلة ${meta.label}`}
              >
                <span
                  className="bi-legend-dot"
                  style={{ background: STAGE_COLORS[step.stage] }}
                />
                <span className="bi-legend-label">{meta.label}</span>
                <strong>{step.count}</strong>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
