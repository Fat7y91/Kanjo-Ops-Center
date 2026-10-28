"use client";

import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

/** Gauge colour shifts with attainment so an outlier is visible at a glance. */
function gaugeColor(ratio: number): string {
  if (ratio >= 0.98) return "#15803d";
  if (ratio >= 0.85) return "#d4a017";
  return "#b91c1c";
}

type TargetGaugeProps = {
  target: number;
  achieved: number;
  height?: number;
};

/**
 * Single target-vs-actual gauge.
 *
 * The parent card owns the label and the drill-down click, so the gauge only
 * renders the arc plus its numeric center.
 */
export function TargetGauge({ target, achieved, height = 116 }: TargetGaugeProps) {
  const ratio = target === 0 ? 0 : achieved / target;
  const percent = Math.round(Math.min(ratio, 1.4) * 100);
  const color = gaugeColor(ratio);
  const data = [{ name: "المحقّق", value: percent, fill: color }];

  return (
    <div className="bi-gauge-canvas" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart
          data={data}
          startAngle={210}
          endAngle={-30}
          innerRadius="72%"
          outerRadius="100%"
          barSize={10}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <Tooltip
            formatter={(value) => [`${value}%`, "نسبة التحقيق"]}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              fontSize: 12,
            }}
          />
          <RadialBar
            dataKey="value"
            background={{ fill: "var(--surface-soft)" }}
            cornerRadius={8}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="bi-gauge-center">
        <strong>{percent}%</strong>
        <span>
          {achieved.toFixed(1)}% / {target.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
