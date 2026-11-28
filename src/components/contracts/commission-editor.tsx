"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputControl } from "@/components/ui/form-inputs";
import type { DraftCommissionLine } from "@/lib/contracts/draft-editor";

/**
 * A rate input that keeps the operator's raw text locally while parsing a
 * clamped number upward, so intermediate states like "12." or an empty field
 * do not get overwritten mid-keystroke.
 */
function RateInput({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <InputControl
      dir="ltr"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(String(parseRate(text)));
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        onChange(parseRate(raw));
      }}
      className={className}
    />
  );
}

type CommissionEditorProps = {
  baseCommission: number;
  lines: DraftCommissionLine[];
  onBaseChange: (value: number) => void;
  onUpdateLine: (
    id: string,
    patch: Partial<Omit<DraftCommissionLine, "id">>,
  ) => void;
  onRemoveLine: (id: string) => void;
  onAddLine: () => void;
};

/**
 * Commission terms editor: the headline platform rate plus per-category
 * overrides. Rates are edited as text and committed as numbers, clamped to a
 * sane 0-100 range so a typo cannot render a nonsensical percentage.
 */
export function CommissionEditor({
  baseCommission,
  lines,
  onBaseChange,
  onUpdateLine,
  onRemoveLine,
  onAddLine,
}: CommissionEditorProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3 rounded-[var(--radius-lg)] bg-[color:var(--surface-soft)] p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.78rem] font-bold text-[color:var(--ink)]">
            النسبة الأساسية للمنصة
          </span>
          <div className="flex items-center gap-2">
            <RateInput
              ariaLabel="النسبة الأساسية"
              value={baseCommission}
              onChange={onBaseChange}
              className="w-24 text-center font-bold"
            />
            <span className="text-sm font-bold text-[color:var(--kanjo-pastel-ink)]">
              %
            </span>
          </div>
        </label>
        <p className="pb-2 text-[0.72rem] text-[color:var(--ink-soft)]">
          تُطبَّق على الطلبات التي لا ينطبق عليها تصنيف خاص.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[color:var(--ink)]">
            نسب حسب التصنيف
          </h3>
          <Button size="sm" variant="quiet" onClick={onAddLine}>
            + إضافة تصنيف
          </Button>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-[var(--radius-control)] bg-[color:var(--surface-soft)] p-3 text-[0.78rem] text-[color:var(--ink-soft)]">
            لا توجد نسب خاصة. ستُطبَّق النسبة الأساسية على كل التصنيفات.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((line) => (
              <li
                key={line.id}
                className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[color:var(--kanjo-surface)] p-2 ring-1 ring-inset ring-[color:var(--line)]"
              >
                <InputControl
                  aria-label="اسم التصنيف"
                  value={line.category}
                  placeholder="اسم التصنيف"
                  onChange={(event) =>
                    onUpdateLine(line.id, { category: event.target.value })
                  }
                />
                <div className="flex w-28 shrink-0 items-center gap-1">
                  <RateInput
                    ariaLabel="نسبة التصنيف"
                    value={line.rate}
                    onChange={(rate) => onUpdateLine(line.id, { rate })}
                    className="w-full text-center"
                  />
                  <span className="text-sm font-bold text-[color:var(--kanjo-pastel-ink)]">
                    %
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label="حذف التصنيف"
                  onClick={() => onRemoveLine(line.id)}
                >
                  حذف
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Parses a rate entry to a 0-100 number, treating empty/invalid input as 0. */
function parseRate(raw: string): number {
  const value = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
