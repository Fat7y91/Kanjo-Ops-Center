"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputControl, TextareaControl } from "@/components/ui/form-inputs";
import { cx } from "@/components/ui/cx";
import type { DraftClause } from "@/lib/contracts/draft-editor";

type ClauseEditorItemProps = {
  clause: DraftClause;
  index: number;
  total: number;
  onUpdate: (patch: Partial<Omit<DraftClause, "id">>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onToggle: () => void;
};

/**
 * Renders `**bold**` segments as <strong> for the inline preview. Everything
 * else is escaped first, so a pasted `<script>` stays literal text.
 */
function renderPreview(markup: string): { __html: string } {
  const escaped = markup
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return { __html: html.replace(/\n/g, "<br>") };
}

/**
 * One editable clause card.
 *
 * The body uses a lightweight markup `**bold**` so operators get emphasis
 * without a contentEditable surface; the toolbar wraps the current selection,
 * and the preview shows the rendered result. Reordering is explicit
 * up/down (no fragile drag), and the card can be disabled rather than deleted so
 * a clause can be restored while reviewing.
 */
export function ClauseEditorItem({
  clause,
  index,
  total,
  onUpdate,
  onMove,
  onRemove,
  onToggle,
}: ClauseEditorItemProps) {
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const preview = useMemo(() => renderPreview(clause.body), [clause.body]);
  const atStart = index === 0;
  const atEnd = index === total - 1;

  function wrapBold() {
    const { start, end } = selection;
    const selected = clause.body.slice(start, end) || "نص";
    const next = `${clause.body.slice(0, start)}**${selected}**${clause.body.slice(end)}`;
    onUpdate({ body: next });
    const cursor = start + 2 + selected.length;
    setSelection({ start: cursor, end: cursor });
  }

  return (
    <article
      className={cx(
        "flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[color:var(--kanjo-surface)] p-4 ring-1 ring-inset ring-[color:var(--line)]",
        !clause.enabled && "opacity-60",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-[color:var(--kanjo-pastel)] text-xs font-bold text-[color:var(--kanjo-pastel-ink)]">
          {index + 1}
        </span>
        <InputControl
          aria-label="عنوان البند"
          value={clause.title}
          onChange={(event) => onUpdate({ title: event.target.value })}
          className="font-bold"
        />
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label="تحريك لأعلى"
            onClick={() => onMove(-1)}
            disabled={atStart}
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="تحريك لأسفل"
            onClick={() => onMove(1)}
            disabled={atEnd}
          >
            ↓
          </Button>
          <Button
            size="sm"
            variant={clause.enabled ? "quiet" : "accent"}
            onClick={onToggle}
          >
            {clause.enabled ? "تعطيل" : "تفعيل"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            aria-label="حذف البند"
            onClick={onRemove}
          >
            حذف
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="quiet" onClick={wrapBold}>
          <strong>B</strong> تعريض
        </Button>
        <span className="text-[0.72rem] text-[color:var(--ink-soft)]">
          حدّد نصًا ثم اضغط تعريض.
        </span>
      </div>

      <TextareaControl
        aria-label="نص البند"
        value={clause.body}
        onChange={(event) => onUpdate({ body: event.target.value })}
        onSelect={(event) => {
          const el = event.currentTarget;
          setSelection({ start: el.selectionStart, end: el.selectionEnd });
        }}
        className="min-h-[96px] leading-relaxed"
        placeholder="اكتب نص البند هنا…"
      />

      {clause.body.trim() ? (
        <div className="rounded-[var(--radius-control)] bg-[color:var(--surface-soft)] p-3">
          <p className="mb-1 text-[0.66rem] font-bold uppercase tracking-wide text-[color:var(--ink-soft)]">
            معاينة
          </p>
          <p
            className="text-sm leading-relaxed text-[color:var(--ink)]"
            dangerouslySetInnerHTML={preview}
          />
        </div>
      ) : null}
    </article>
  );
}
