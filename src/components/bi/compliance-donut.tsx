"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { BI_DOCUMENT_META, type BiDocumentKey } from "@/lib/bi/types";
import type { ComplianceBreakdown } from "@/lib/bi/select";

type ComplianceDonutProps = {
  breakdown: ComplianceBreakdown[];
  onSelect: (key: BiDocumentKey) => void;
};

export function ComplianceDonut({
  breakdown,
  onSelect,
}: ComplianceDonutProps) {
  const complete = breakdown.reduce((total, item) => total + item.complete, 0);
  const total = breakdown.reduce((sum, item) => sum + item.total, 0);
  const rate = total === 0 ? 0 : Math.round((complete / total) * 100);

  return (
    <div className="bi-compliance">
      <div className="bi-donut">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Tooltip
              formatter={(value, name) => [`${value} تاجر`, name]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--surface)",
                fontSize: 12,
              }}
            />
            <Pie
              data={breakdown.map((item) => ({
                key: item.key,
                name: BI_DOCUMENT_META[item.key].label,
                value: item.complete,
                fill: BI_DOCUMENT_META[item.key].color,
              }))}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={2}
              isAnimationActive={false}
              onClick={(entry) => {
                const key = (entry as { key?: BiDocumentKey }).key;
                if (key) onSelect(key);
              }}
            >
              {breakdown.map((item) => (
                <Cell
                  key={item.key}
                  fill={BI_DOCUMENT_META[item.key].color}
                  cursor="pointer"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="bi-donut-center">
          <strong>{rate}%</strong>
          <span>اكتمال الحزمة</span>
        </div>
      </div>

      <ul className="bi-compliance-list">
        {breakdown.map((item) => {
          const meta = BI_DOCUMENT_META[item.key];
          return (
            <li key={item.key}>
              <button
                type="button"
                className="bi-compliance-row"
                onClick={() => onSelect(item.key)}
                aria-label={`عرض تفاصيل ${meta.label}`}
              >
                <span
                  className="bi-legend-dot"
                  style={{ background: meta.color }}
                />
                <span className="bi-compliance-label">{meta.label}</span>
                <span className="bi-compliance-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.round(item.rate * 100)}%`,
                      background: meta.color,
                    }}
                  />
                </span>
                <strong>{Math.round(item.rate * 100)}%</strong>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
