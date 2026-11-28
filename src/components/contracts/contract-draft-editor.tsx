"use client";

import { useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { ClauseEditorItem } from "@/components/contracts/clause-editor-item";
import { CommissionEditor } from "@/components/contracts/commission-editor";
import {
  DraftPreview,
  DraftSummaryStrip,
} from "@/components/contracts/draft-editor-panels";
import { SectionEditor } from "@/components/contracts/section-editor";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { toArabicNumerals } from "@/lib/contracts/render/format";
import { CONTRACT_STATUS_META } from "@/lib/contracts/types";
import type { Contract } from "@/lib/contracts/types";
import type { DraftEditorController } from "@/components/contracts/use-draft-editor";

type ContractDraftEditorProps = {
  editor: DraftEditorController;
  contract: Contract;
  saving: boolean;
  onSave: () => Promise<string>;
};

/**
 * Contract draft editor shell.
 *
 * Presents the editable terms across three working tabs (clauses, commission,
 * sections) plus a read-only preview. The "تحرير المسودة" entry point is
 * available for every contract status; a finalised contract (signed/cancelled)
 * only becomes editable when the operator holds `edit_finalized_contracts`.
 * Every mutation is wired to the controller, and saving PUTs the whole terms
 * payload to the terms endpoint.
 */
export function ContractDraftEditor({
  editor,
  contract,
  saving,
  onSave,
}: ContractDraftEditorProps) {
  const { hasPermission } = usePermission();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { draft } = editor;

  const meta = CONTRACT_STATUS_META[contract.status];
  const finalised =
    contract.status === "signed" || contract.status === "cancelled";
  const canForceEdit = hasPermission("edit_finalized_contracts");
  const locked = finalised && !canForceEdit;

  async function save() {
    setNotice("");
    setError("");
    try {
      setNotice(await onSave());
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "تعذر حفظ المسودة.",
      );
    }
  }

  const clausesTab = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[0.78rem] text-[color:var(--ink-soft)]">
          رتّب البنود، عدّل نصها، عطّل ما لا يلزم أو أضف بنودًا مخصصة.
        </p>
        <Button size="sm" onClick={editor.addClause} disabled={locked}>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${meta.tone}`}>{meta.label}</span>
        <span className="text-[0.78rem] font-semibold text-[color:var(--ink)]">
          {contract.reference}
        </span>
        <DraftSummaryStrip editor={editor} />
      </div>

      {locked ? (
        <>
          <p
            className="rounded-[var(--radius-lg)] bg-[color:var(--surface-soft)] p-3 text-[0.82rem] text-[color:var(--ink-soft)]"
            role="alert"
          >
            هذا العقد منتهٍ. يتطلب تحريره صلاحية «تحرير العقود المنتهية» التي
            يمنحها المسؤول من مصفوفة الصلاحيات. العرض متاح للقراءة فقط.
          </p>
          <DraftPreview draft={draft} />
        </>
      ) : (
        <>
          <Tabs
            items={[
              {
                id: "clauses",
                label: `البنود (${toArabicNumerals(draft.clauses.length)})`,
                content: clausesTab,
              },
              { id: "commission", label: "العمولات", content: commissionTab },
              {
                id: "sections",
                label: "الأقسام",
                content: <SectionEditor editor={editor} />,
              },
              {
                id: "preview",
                label: "معاينة",
                content: <DraftPreview draft={draft} />,
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
                  setError("");
                }}
                disabled={!editor.dirty}
              >
                استعادة
              </Button>
              <Button onClick={() => void save()} disabled={!editor.dirty || saving}>
                {saving ? "جارٍ الحفظ..." : "حفظ المسودة"}
              </Button>
            </div>
            {error ? (
              <p className="text-[0.78rem] font-semibold text-red-600" role="alert">
                {error}
              </p>
            ) : notice ? (
              <p className="text-[0.78rem] font-semibold text-[color:var(--green)]" role="status">
                {notice}
              </p>
            ) : editor.dirty ? (
              <p className="text-[0.78rem] text-[color:var(--ink-soft)]">
                توجد تغييرات غير محفوظة.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
