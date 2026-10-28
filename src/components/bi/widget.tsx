"use client";

import type { ReactNode } from "react";

type WidgetSpan = 4 | 5 | 6 | 7 | 8 | 12;

type WidgetProps = {
  eyebrow: string;
  title: string;
  badge?: ReactNode;
  span?: WidgetSpan;
  children: ReactNode;
};

/**
 * Dense dashboard widget shell.
 *
 * A widget owns a group of related metrics and separates them with internal
 * dividers instead of gaps, which removes the dead space produced by the old
 * one-card-per-number bento without losing any drill-down target.
 */
export function Widget({
  eyebrow,
  title,
  badge,
  span = 12,
  children,
}: WidgetProps) {
  return (
    <section className={`bi-widget bi-widget-${span}`} aria-label={title}>
      <header className="bi-widget-head">
        <div className="bi-widget-titles">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {badge ? <div className="bi-widget-meta">{badge}</div> : null}
      </header>
      <div className="bi-widget-body">{children}</div>
    </section>
  );
}

type StatTone = "default" | "gold" | "green" | "red" | "purple";

type WidgetStatProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: StatTone;
  /** 0-1 ratio rendered as a micro progress bar. Omit to hide it. */
  progress?: number;
  onOpen?: () => void;
};

/** Compact metric inside a widget body. */
export function WidgetStat({
  label,
  value,
  detail,
  tone = "default",
  progress,
  onOpen,
}: WidgetStatProps) {
  const content = (
    <>
      <span className="bi-stat-label">{label}</span>
      <strong className="bi-stat-value">{value}</strong>
      {detail ? <span className="bi-stat-detail">{detail}</span> : null}
      {progress !== undefined ? (
        <span className="bi-stat-track" aria-hidden="true">
          <span
            className="bi-stat-fill"
            style={{ width: `${Math.max(2, Math.min(progress, 1) * 100)}%` }}
          />
        </span>
      ) : null}
    </>
  );

  const className = `bi-stat bi-stat-${tone}${onOpen ? " is-clickable" : ""}`;

  if (onOpen) {
    return (
      <button
        type="button"
        className={className}
        onClick={onOpen}
        aria-label={`${label} — ${value}. عرض التفاصيل`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

/** Vertical rule between sibling stats. */
export function WidgetDivider() {
  return <span className="bi-divider" aria-hidden="true" />;
}
