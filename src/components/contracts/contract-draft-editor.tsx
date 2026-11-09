"use client";

import { useState } from "react";

import { ClauseEditorItem } from "@/components/contracts/clause-editor-item";
import { CommissionEditor } from "@/components/contracts/commission-editor";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { toArabicNumerals } from "@/lib/contracts/render/format";
import type { ContractDraft } from "@/lib/contracts/draft-editor";
import type { DraftEditorController } from "@/components/contracts/use-draft-editor";

type ContractDraftEditorProps = {
  editor: DraftEditorController;
};

/**
 * Contract draft editor shell.
 *
 * Presents the mocked editable terms in two working tabs (clauses, commission)
 * plus a read-only preview tab that renders the current draft as ordered prose.
 * Every control is wired to the controller so the review reflects real editing
 * behaviour; nothing here persists yet — this is the UI-first step.
 */
export function ContractDraftEditor({ editor }: ContractDraftEditorProps) {
  const [notice, setNotice] = useState("");
  const { draft } = editor;

  const clausesTab = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[0.78rem] text-[color:var(--ink-soft)]">
          رتّب البنود، عدّل نصها، عطّل ما لا يلزم أو أضف بنودًا مخصصة.
        </p>
        <Button size="sm" onClick={editor.addClause}>
          + إضافة بند
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {draft.clauses.map((clause, index) => (
          <ClauseEditorItem
            key={clause.id}
            clause={clause}
            index={index}
            total={draft.clauses.length}
            onUpdate={(patch) => editor.updateClause(clause.id, patch)}
            onMove={(direction) => editor.moveClause(clause.id, direction)}
            onRemove={() => editor.removeClause(clause.id)}
            onToggle={() => editor.toggleClause(clause.id)}
          />
        ))}
        {draft.clauses.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] bg-[color:var(--surface-soft)] p-4 text-center text-sm text-[color:var(--ink-soft)]">
            لا توجد بنود. أضف بندًا للبدء.
          </p>
        ) : null}
      </div>
    </div>
  );

  const commissionTab = (
    <CommissionEditor
      baseCommission={draft.baseCommission}
      lines={draft.commissionLines}
      onBaseChange={editor.setBaseCommission}
      onUpdateLine={editor.updateCommissionLine}
      onRemoveLine={editor.removeCommissionLine}
      onAddLine={editor.addCommissionLine}
    />
  );

  const previewTab = <DraftPreview draft={draft} />;

  return (
    <div className="flex flex-col gap-4">
      <DraftSummaryStrip editor={editor} />

      <Tabs
        items={[
          {
            id: "clauses",
            label: `البنود (${toArabicNumerals(draft.clauses.length)})`,
            content: clausesTab,
          },
          {
            id: "commission",
            label: "العمولات",
            content: commissionTab,
          },
          {
            id: "preview",
            label: "معاينة",
            content: previewTab,
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--line)] pt-4">
        <div className="flex items-center gap-2">
          <Button
            variant="quiet"
            onClick={() => {
              editor.reset();
              setNotice("تمت استعادة المسودة الأصلية.");
            }}
            disabled={!editor.dirty}
          >
            استعادة
          </Button>
          <Button
            onClick={() => setNotice("تم حفظ المسودة (معاينة تجريبية).")}
          >
            حفظ المسودة
          </Button>
        </div>
        {notice ? (
          <p className="text-[0.78rem] font-semibold text-[color:var(--green)]" role="status">
            {notice}
          </p>
        ) : editor.dirty ? (
          <p className="text-[0.78rem] text-[color:var(--ink-soft)]">
            توجد تغييرات غير محفوظة.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Compact status strip above the tabs. */
function DraftSummaryStrip({ editor }: { editor: DraftEditorController }) {
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
function DraftPreview({ draft }: { draft: ContractDraft }) {
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
    </div>
  );
}
