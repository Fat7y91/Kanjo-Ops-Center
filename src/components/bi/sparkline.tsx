"use client";

type SparklineProps = {
  values: number[];
  height?: number;
  tone?: "purple" | "gold" | "green" | "red";
  ariaLabel?: string;
};

const TONE_COLORS: Record<NonNullable<SparklineProps["tone"]>, string> = {
  purple: "var(--purple)",
  gold: "var(--gold)",
  green: "#2ca36a",
  red: "#d24b4b",
};

/**
 * Minimal area sparkline drawn with plain SVG.
 *
 * Recharts is already loaded for the funnel/gauge widgets; a full chart
 * instance per stat would cost far more DOM than a 40x14 polyline.
 */
export function Sparkline({
  values,
  height = 34,
  tone = "purple",
  ariaLabel,
}: SparklineProps) {
  if (values.length < 2) return null;

  const width = 100;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const color = TONE_COLORS[tone];
  const gradientId = `spark-${tone}`;

  return (
    <svg
      className="bi-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? "اتجاه"}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
