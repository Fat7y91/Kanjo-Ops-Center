"use client";

import { Button } from "@/components/ui/button";
import { InputControl, TextAreaField } from "@/components/ui/form-inputs";
import type { DraftPartyRow } from "@/lib/contracts/draft-editor";
import type { DraftEditorController } from "@/components/contracts/use-draft-editor";

type PartyKey = "firstPartyRows" | "secondPartyRows";

type SectionEditorProps = {
  editor: DraftEditorController;
};

/** A label/value row list for one party panel. */
function PartyRowsEditor({
  title,
  rows,
  party,
  editor,
}: {
  title: string;
  rows: DraftPartyRow[];
  party: PartyKey;
  editor: DraftEditorController;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[color:var(--surface-soft)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[color:var(--ink)]">{title}</h3>
        <Button size="sm" variant="quiet" onClick={() => editor.addPartyRow(party)}>
          + صف
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[0.78rem] text-[color:var(--ink-soft)]">
          لا توجد حقول مخصصة. أضف صفًا لتجاوز البيانات الافتراضية.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <InputControl
                aria-label="التسمية"
                placeholder="التسمية"
                value={row.label}
                onChange={(event) =>
                  editor.updatePartyRow(party, row.id, { label: event.target.value })
                }
                className="w-40 shrink-0"
              />
              <InputControl
                aria-label="القيمة"
                placeholder="القيمة"
                value={row.value}
                onChange={(event) =>
                  editor.updatePartyRow(party, row.id, { value: event.target.value })
                }
              />
              <Button
                size="sm"
                variant="quiet"
                aria-label="حذف الصف"
                onClick={() => editor.removePartyRow(party, row.id)}
              >
                حذف
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Narrative and party overrides.
 *
 * Every non-clause part of the document can be reworded here: the preamble, the
 * copies note, a free summary note, and the identification rows of both party
 * panels. Blank fields fall back to the canonical copy at render time, so an
 * operator only overrides what the contract actually needs to change.
 */
export function SectionEditor({ editor }: SectionEditorProps) {
  const { draft } = editor;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.78rem] text-[color:var(--ink-soft)]">
        عدّل التمهيد والملاحظات وحقول الطرفين. ما تتركه فارغًا يبقى على الصياغة
        القانونية الافتراضية.
      </p>

      <TextAreaField
        label="التمهيد"
        value={draft.preamble}
        onChange={(event) => editor.setSectionText("preamble", event.target.value)}
        placeholder="نص التمهيد الافتراضي"
      />

      <TextAreaField
        label="ملاحظة النسخ"
        value={draft.copiesNote}
        onChange={(event) => editor.setSectionText("copiesNote", event.target.value)}
        placeholder="نص ملاحظة النسخ الافتراضي"
      />

      <TextAreaField
        label="ملاحظة الملخص النهائي"
        value={draft.summaryNote}
        onChange={(event) => editor.setSectionText("summaryNote", event.target.value)}
        placeholder="ملاحظة إضافية تظهر في الملحق النهائي"
      />

      <PartyRowsEditor
        title="الطرف الأول · كانچو"
        rows={draft.firstPartyRows}
        party="firstPartyRows"
        editor={editor}
      />
      <PartyRowsEditor
        title="الطرف الثاني · التاجر"
        rows={draft.secondPartyRows}
        party="secondPartyRows"
        editor={editor}
      />
    </div>
  );
}
