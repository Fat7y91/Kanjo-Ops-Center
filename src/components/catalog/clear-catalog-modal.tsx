"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";

const CONFIRM_WORD = "حذف";

type ClearCatalogModalProps = {
  open: boolean;
  merchantId: string;
  merchantName: string;
  productCount: number;
  onClose: () => void;
  onCleared: (deletedCount: number) => void;
};

/**
 * Danger dialog for wiping a merchant's catalog.
 *
 * The destructive action stays disabled until the operator types the exact
 * Arabic word, so a stray click cannot empty a menu. The message states that
 * orders and accounts are unaffected, which is true: the endpoint only deletes
 * `catalog_products` rows.
 */
export function ClearCatalogModal({
  open,
  merchantId,
  merchantName,
  productCount,
  onClose,
  onCleared,
}: ClearCatalogModalProps) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setConfirmation("");
    setBusy(false);
    setError("");
  }, [open]);

  const confirmed = confirmation.trim() === CONFIRM_WORD;

  async function handleConfirm() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/catalog/merchants/${encodeURIComponent(merchantId)}/products`,
        { method: "DELETE", cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        deletedCount?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر حذف كتالوج التاجر.");
      }
      onCleared(payload.deletedCount ?? productCount);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "تعذر حذف كتالوج التاجر.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="حذف الكتالوج بالكامل"
      eyebrow="إجراء لا يمكن التراجع عنه"
      onClose={busy ? () => undefined : onClose}
    >
      <div className="flex flex-col gap-4">
        <p className="inline-note" role="alert">
          سيتم حذف جميع منتجات كتالوج {merchantName} ({productCount} منتج)
          نهائياً ولا يمكن التراجع عن هذا الإجراء. لن تتأثر الطلبات أو الحسابات
          السابقة.
        </p>

        <TextField
          label={`اكتب «${CONFIRM_WORD}» للتأكيد`}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          disabled={busy}
          dir="rtl"
        />

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <Button
            variant="danger"
            onClick={() => void handleConfirm()}
            disabled={!confirmed || busy}
            data-busy={busy ? "true" : undefined}
          >
            {busy ? "جارٍ الحذف…" : "تأكيد حذف الكل"}
          </Button>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}
