"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { DataTable } from "@/components/bi/data-table";
import { downloadCsv } from "@/lib/bi/export";
import type { BiTable } from "@/lib/bi/types";

type SlideOverProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  table: BiTable | null;
  onClose: () => void;
  children?: ReactNode;
};

/**
 * Right-anchored drill-down panel.
 *
 * Every dashboard card opens the same shell with a different `BiTable`, so the
 * export affordance and the empty/loading states are implemented exactly once.
 */
export function SlideOver({
  open,
  title,
  eyebrow,
  description,
  table,
  onClose,
}: SlideOverProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const content = (
    <div
      className="slideover-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="slideover-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="slideover-head">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
            {description ? <p className="modal-note">{description}</p> : null}
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="إغلاق اللوحة"
          >
            ×
          </button>
        </header>

        <div className="slideover-toolbar">
          <span className="bi-row-count">
            {table ? `${table.rows.length} سجل` : "لا توجد بيانات"}
          </span>
          <button
            type="button"
            className="button button-small button-primary"
            onClick={() => table && downloadCsv(table)}
            disabled={!table || table.rows.length === 0}
          >
            تصدير Excel/CSV
          </button>
        </div>

        <div className="slideover-body">
          {table ? <DataTable table={table} /> : null}
        </div>
      </aside>
    </div>
  );

  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}
