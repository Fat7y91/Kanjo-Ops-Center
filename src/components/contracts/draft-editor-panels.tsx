"use client";

import { toArabicNumerals } from "@/lib/contracts/render/format";
import type { ContractDraft } from "@/lib/contracts/draft-editor";
import type { DraftEditorController } from "@/components/contracts/use-draft-editor";

/** Compact status strip above the tabs. */
export function DraftSummaryStrip({ editor }: { editor: DraftEditorController }) {
  const { draft } = editor;
  const activeCount = draft.clauses.filter((clause) => clause.enabled).length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="badge badge-gold">{draft.merchantName}</span>
      <span className="text-[0.78rem] text-[color:var(--ink-soft)]">
        {toArabicNumerals(activeCount)} بند نشط
        {editor.disabledCount > 0
          ? ` · ${toArabicNumerals(editor.disabledCount)} معطّل`
          : ""}
        {` · ${toArabicNumerals(editor.totalCommissionRows)} تصنيف عمولة`}
      </span>
    </div>
  );
}

/** Read-only rendering of the current draft as ordered contract prose. */
export function DraftPreview({ draft }: { draft: ContractDraft }) {
  const active = draft.clauses.filter((clause) => clause.enabled);
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[color:var(--surface-soft)] p-5">
      <div>
        <p className="text-[0.7rem] font-bold uppercase tracking-wide text-[color:var(--ink-soft)]">
          {draft.merchantName}
        </p>
        <h3 className="mt-1 text-base font-bold text-[color:var(--ink)]">
          مسودة بنود العقد
        </h3>
      </div>

      {draft.preamble ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-[color:var(--ink-soft)]">
          {draft.preamble}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {active.map((clause, index) => (
          <div key={clause.id}>
            <p className="text-sm font-bold text-[color:var(--kanjo-pastel-ink)]">
              {toArabicNumerals(index + 1)}. {clause.title}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[color:var(--ink)]">
              {clause.body.replace(/\*\*/g, "")}
            </p>
          </div>
        ))}
        {active.length === 0 ? (
          <p className="text-center text-sm text-[color:var(--ink-soft)]">
            لا توجد بنود نشطة.
          </p>
        ) : null}
      </div>

      <div className="rounded-[var(--radius-control)] bg-[color:var(--kanjo-surface)] p-3">
        <p className="text-[0.72rem] font-bold text-[color:var(--ink-soft)]">
          العمولات
        </p>
        <p className="mt-1 text-sm text-[color:var(--ink)]">
          النسبة الأساسية: {toArabicNumerals(draft.baseCommission)}%
          {draft.commissionLines.length > 0
            ? ` · ${draft.commissionLines
                .map(
                  (line) =>
                    `${line.category || "بدون اسم"}: ${toArabicNumerals(line.rate)}%`,
                )
                .join(" · ")}`
            : ""}
        </p>
      </div>

      {draft.summaryNote ? (
        <div className="rounded-[var(--radius-control)] bg-[color:var(--kanjo-surface)] p-3">
          <p className="text-[0.72rem] font-bold text-[color:var(--ink-soft)]">
            ملاحظة الملخص
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--ink)]">
            {draft.summaryNote}
          </p>
        </div>
      ) : null}
    </div>
  );
}
