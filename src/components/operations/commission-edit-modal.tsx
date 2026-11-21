"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import {
  operationMoney,
  operationPercent,
} from "@/lib/operations/format";
import type { OperationSummary } from "@/lib/operations/types";

export type CommissionSaveResult =
  | { ok: true; operation: OperationSummary }
  | { ok: false; error: string };

/**
 * Per-order commission override.
 *
 * Only the rate is sent; the server recomputes the amount from the order value
 * so the client can never post an inconsistent money figure.
 */
export function CommissionEditModal({
  open,
  operation,
  onClose,
  onSubmit,
}: {
  open: boolean;
  operation: OperationSummary | null;
  onClose: () => void;
  onSubmit: (
    operation: OperationSummary,
    rate: number,
  ) => Promise<CommissionSaveResult>;
}) {
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !operation) return;
    setRate(String(operation.commissionPercent));
    setBusy(false);
    setError("");
  }, [open, operation]);

  if (!operation) return null;

  async function save() {
    if (!operation) return;
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError("أدخل نسبة بين 0 و 100.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await onSubmit(operation, parsed);
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  const preview = Number.isFinite(Number(rate))
    ? (operation.orderValue * Number(rate)) / 100
    : 0;

  return (
    <Modal
      open={open}
      title="تعديل العمولة"
      eyebrow={`طلب ${operation.orderId}`}
      description={operation.merchantName}
      onClose={onClose}
    >
      <div className="quick-settle-form">
        <p className="muted" dir="rtl">
          العمولة الحالية {operationPercent(operation.commissionPercent)} ·{" "}
          {operationMoney(operation.commission, operation.currency)} — تطبق على
          هذا الطلب فقط.
        </p>

        <TextField
          label="نسبة العمولة %"
          inputMode="decimal"
          dir="ltr"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          hint={`العمولة المحتسبة: ${operationMoney(
            preview,
            operation.currency,
          )}`}
        />

        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions">
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? "جارٍ الحفظ…" : "حفظ العمولة"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}
