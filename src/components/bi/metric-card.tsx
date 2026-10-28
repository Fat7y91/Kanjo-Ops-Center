"use client";

import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "gold" | "green" | "red" | "purple";
  span?: "xs" | "sm" | "md" | "lg" | "xl";
  onOpen?: () => void;
  footer?: ReactNode;
  children?: ReactNode;
};

/**
 * The bento tile.
 *
 * When `onOpen` is provided the whole card becomes a button so the entire
 * surface is a drill-down target, not just a small "details" link.
 */
export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
  span = "sm",
  onOpen,
  footer,
  children,
}: MetricCardProps) {
  const body = (
    <>
      <div className="bi-card-head">
        <span className="bi-card-label">{label}</span>
        {onOpen ? (
          <span className="bi-card-drill" aria-hidden="true">
            تفاصيل
          </span>
        ) : null}
      </div>
      <div className="bi-card-value-row">
        <strong className="bi-card-value">{value}</strong>
      </div>
      {detail ? <span className="bi-card-detail">{detail}</span> : null}
      {children}
    </>
  );

  const className = `bi-card bi-card-${tone} bi-span-${span}${onOpen ? " is-clickable" : ""}`;

  if (onOpen) {
    return (
      <button
        type="button"
        className={className}
        onClick={onOpen}
        aria-label={`${label} — ${value}. عرض التفاصيل`}
      >
        {body}
        {footer}
      </button>
    );
  }

  return (
    <article className={className}>
      {body}
      {footer}
    </article>
  );
}
