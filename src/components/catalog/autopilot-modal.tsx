"use client";

import { useEffect } from "react";

import { AutopilotPreview } from "@/components/catalog/autopilot-preview";
import { AutopilotProgressPanel } from "@/components/catalog/autopilot-progress";
import { useAutopilot } from "@/components/catalog/use-autopilot";
import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { Field, InputControl } from "@/components/ui/form-inputs";

type AutopilotModalProps = {
  open: boolean;
  merchantId: string;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Zero-touch POS importer for one supermarket. The operator only picks the
 * workbook; parsing, enrichment and saving are narrated by the progress panel.
 */
export function AutopilotModal({
  open,
  merchantId,
  onClose,
  onSaved,
}: AutopilotModalProps) {
  const autopilot = useAutopilot(merchantId, onSaved);
  const running = autopilot.stage === "running";

  useEffect(() => {
    if (open) autopilot.reset();
  }, [open, autopilot.reset]);

  const canStart =
    Boolean(autopilot.sheet?.items.length) &&
    (autopilot.stage === "ready" || autopilot.stage === "failed");

  return (
    <Modal
      open={open}
      title="الاستيراد التلقائي"
      eyebrow="كتالوج السوبر ماركت"
      description="ارفع ملف نقاط البيع بصيغة Excel أو CSV. الاسم والباركود والسعر كما هي في الملف، ويُستكمل التصنيف والصورة تلقائياً."
      onClose={() => {
        if (!running) onClose();
      }}
      wide
    >
      <div className="autopilot-body">
        <Field
          label="ملف نقاط البيع"
          hint="xls أو xlsx أو csv، بحد أقصى 20 ميجابايت."
        >
          <InputControl
            key={`${autopilot.fileName}:${autopilot.stage}`}
            type="file"
            accept=".xls,.xlsx,.csv"
            disabled={running || autopilot.stage === "parsing"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void autopilot.loadFile(file);
            }}
          />
        </Field>

        {autopilot.stage === "parsing" ? (
          <p className="autopilot-note">جاري قراءة الملف…</p>
        ) : null}

        {autopilot.error ? (
          <p className="form-error" role="alert">
            {autopilot.error}
          </p>
        ) : null}

        {autopilot.sheet ? (
          <AutopilotPreview
            sheet={autopilot.sheet}
            fileName={autopilot.fileName}
          />
        ) : null}

        {autopilot.stage === "running" || autopilot.stage === "done" ? (
          <AutopilotProgressPanel
            progress={autopilot.progress}
            summary={autopilot.summary}
          />
        ) : null}

        <div className="form-actions">
          {autopilot.stage === "done" ? (
            <Button variant="quiet" onClick={autopilot.reset}>
              استيراد ملف آخر
            </Button>
          ) : null}

          <Button
            variant="ghost"
            onClick={onClose}
            disabled={running}
          >
            إغلاق
          </Button>

          <Button
            variant="primary"
            onClick={() => void autopilot.start()}
            disabled={!canStart || running}
          >
            {running
              ? `جاري المعالجة: ${autopilot.progress.processed.toLocaleString("ar-EG")} / ${autopilot.progress.total.toLocaleString("ar-EG")}`
              : "بدء الاستيراد التلقائي"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
