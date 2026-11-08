"use client";

import { useState } from "react";

import { ContractForm } from "@/components/contracts/contract-form";
import { ContractTable } from "@/components/contracts/contract-table";
import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import type { ContractsPayload } from "@/lib/contracts/payload";
import type { Contract } from "@/lib/contracts/types";

type ContractsViewProps = {
  data: ContractsPayload;
  canDraft: boolean;
  canEdit: boolean;
  canSign: boolean;
  canCancel: boolean;
  onReload: () => void;
};

type Dialog =
  | { kind: "closed" }
  | { kind: "draft" }
  | { kind: "edit"; contract: Contract };

/**
 * Contract register UI.
 *
 * Every mutation the page exposes is wired to `PATCH/POST /api/contracts`, and
 * the capability that guards each button is the same key the server checks.
 * There is no optimistic row: the response is the stored contract, so the table
 * can never show a state the database rejected.
 */
export function ContractsView({
  data,
  canDraft,
  canEdit,
  canSign,
  canCancel,
  onReload,
}: ContractsViewProps) {
  const [dialog, setDialog] = useState<Dialog>({ kind: "closed" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function done(message: string) {
    setNotice(message);
    setError("");
    setDialog({ kind: "closed" });
    onReload();
  }

  async function act(contract: Contract, action: "send" | "sign" | "cancel") {    setBusyId(contract.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          signatory: action === "sign" ? contract.signatory : undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر تنفيذ الإجراء.");
      done(
        action === "sign"
          ? "تم توقيع العقد."
          : action === "cancel"
            ? "تم إلغاء العقد."
            : "تم إرسال العقد للتوقيع.",
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "تعذر تنفيذ الإجراء.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function downloadPdf(contract: Contract) {
    setBusyId(contract.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/contracts/${contract.id}/pdf`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "تعذر إنشاء ملف العقد.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `contract-${contract.reference}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "تعذر إنشاء ملف العقد.",
      );
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Opens the rendered contract in a new tab for review/printing.
   *
   * The tab is opened synchronously on click (before the request) so the browser
   * does not treat the later navigation as a pop-up. The PDF route answers as
   * `inline`, so the browser's own viewer handles preview and print. Session
   * cookies ride along on the navigation, so the route authorizes normally.
   */
  function previewPdf(contract: Contract) {
    const url = `/api/contracts/${contract.id}/pdf`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      setError("تعذّر فتح معاينة العقد. اسمح بالنوافذ المنبثقة ثم حاول مجدداً.");
      return;
    }
    setError("");
    setNotice("");
  }

  return (
    <>
      <PageHeader
        eyebrow="الحوكمة التجارية"
        title="سجل العقود"
        description="الصياغة والتعديل والتوقيع المعتمد صلاحيات منفصلة. لا تُستنتج صلاحية التوقيع من المسمى الوظيفي أبداً."
        actions={
          <div className="row-actions">
            <span className="badge badge-gold">{data.contracts.length} عقد</span>
            {canDraft ? (
              <Button size="sm" onClick={() => setDialog({ kind: "draft" })}>
                صياغة عقد
              </Button>
            ) : null}
          </div>
        }
      />

      {notice ? (
        <p className="accounts-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <ContractTable
        contracts={data.contracts}
        busyId={busyId}
        canEdit={canEdit}
        canSign={canSign}
        canCancel={canCancel}
        onEdit={(contract) => setDialog({ kind: "edit", contract })}
        onAction={(contract, action) => void act(contract, action)}
        onPreviewPdf={previewPdf}
        onDownloadPdf={(contract) => void downloadPdf(contract)}
      />

      <Modal
        open={dialog.kind !== "closed"}
        eyebrow="سجل العقود"
        title={dialog.kind === "edit" ? "تعديل العقد" : "صياغة عقد"}
        description={
          dialog.kind === "edit"
            ? `تعديل ${dialog.contract.reference}`
            : "اختر التاجر وأدخل قيمة العقد والجهة الموقّعة."
        }
        onClose={() => setDialog({ kind: "closed" })}
        wide
      >
        <ContractForm
          contract={dialog.kind === "edit" ? dialog.contract : undefined}
          merchants={data.merchants}
          onDone={done}
        />
      </Modal>
    </>
  );
}
