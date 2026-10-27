"use client";

import { useCallback, useState } from "react";

import { VisitMode, type VisitDraft } from "@/components/field-ops/visit-mode";
import {
  VisitReportForm,
  type VisitReportDraft,
} from "@/components/field-ops/visit-report-form";
import { enqueueVisit, useVisitQueue } from "@/lib/field-ops/offline-queue";
import type { Merchant } from "@/lib/field-ops/types";

export type VisitEngineTarget = {
  merchant: Merchant;
  taskId: string | null;
  visitCount: number;
};

type VisitEngineProps = {
  target: VisitEngineTarget | null;
  canManageState: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
};

type Phase = "focus" | "report";

/**
 * Orchestrates the three phases of a field visit:
 *   focus (GPS + live timer) -> report (data entry) -> persist (online/offline).
 *
 * Online writes go straight to the API and refresh the CRM card. Offline (or
 * failed) writes are appended to the durable queue and replayed automatically
 * the moment connectivity returns, so a rep never loses captured work.
 */
export function VisitEngine({
  target,
  canManageState,
  onClose,
  onSaved,
}: VisitEngineProps) {
  const [phase, setPhase] = useState<Phase>("focus");
  const [draft, setDraft] = useState<VisitDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { online, flush } = useVisitQueue();

  const reset = useCallback(() => {
    setPhase("focus");
    setDraft(null);
    setSaving(false);
    setError("");
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  function completeFocus(nextDraft: VisitDraft) {
    setDraft(nextDraft);
    setPhase("report");
  }

  async function persist(report: VisitReportDraft) {
    if (!target || !draft) return;
    setSaving(true);
    setError("");

    const payload = {
      outcome: report.outcome,
      notes: report.notes,
      taskId: draft.taskId,
      startedAt: draft.startedAt,
      endedAt: draft.endedAt,
      durationSeconds: draft.durationSeconds,
      startLocation: draft.startLocation,
      endLocation: draft.endLocation,
      contact: report.contact,
      opinions: report.opinions,
      followUpAt: report.followUpAt || null,
      followUpKind: report.followUpKind,
      followUpNote: report.followUpNote,
      source: draft.taskId ? ("task" as const) : ("unplanned" as const),
      clientVisitId: draft.clientVisitId,
    };

    // Offline is a first-class path: queue immediately, then try a flush so a
    // flaky connection still syncs without the rep doing anything.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await enqueueVisit({
        clientVisitId: draft.clientVisitId,
        merchantId: target.merchant.id,
        merchantName: target.merchant.name,
        payload,
      });
      onSaved(
        `تم حفظ زيارة ${target.merchant.name} محلياً. ستُزامن تلقائياً عند عودة الشبكة.`,
      );
      setSaving(false);
      close();
      return;
    }

    try {
      const response = await fetch(
        `/api/field-ops/merchants/${target.merchant.id}/reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "تعذر حفظ تقرير الزيارة.");
      }
      onSaved(
        report.followUpAt
          ? `تم حفظ زيارة ${target.merchant.name} وجدولة مهمة متابعة للفريق.`
          : `تم حفظ زيارة ${target.merchant.name} وتحديث كارت التاجر.`,
      );
      close();
    } catch (submitError) {
      // Network-level failure must not lose the report: fall back to the queue.
      const message =
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ تقرير الزيارة.";
      const networkFailure =
        typeof navigator !== "undefined" && navigator.onLine === false;

      await enqueueVisit({
        clientVisitId: draft.clientVisitId,
        merchantId: target.merchant.id,
        merchantName: target.merchant.name,
        payload,
      });

      if (networkFailure) {
        onSaved(
          `انقطع الاتصال أثناء الحفظ. تم تخزين زيارة ${target.merchant.name} محلياً للمزامنة.`,
        );
        close();
      } else {
        setError(`${message} تم حفظ نسخة محلية للمحاولة لاحقاً.`);
        void flush();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!target) return null;

  if (phase === "focus") {
    return (
      <VisitMode
        merchant={target.merchant}
        taskId={target.taskId}
        onComplete={completeFocus}
        onCancel={close}
      />
    );
  }

  return (
    <>
      <VisitReportForm
        open
        merchant={target.merchant}
        draft={draft}
        visitCount={target.visitCount}
        canManageState={canManageState}
        offline={!online}
        saving={saving}
        onClose={close}
        onSubmit={(report) => void persist(report)}
      />
      {error ? (
        <div className="toast toast-error" role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}
