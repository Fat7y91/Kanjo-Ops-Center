"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { operationMoney } from "@/lib/operations/format";
import type {
  SettlementDraft,
  SettlementResult,
} from "@/components/operations/use-clearinghouse";
import type { ClearingAccountRow } from "@/lib/operations/types";

type QuickSettleModalProps = {
  open: boolean;
  account: ClearingAccountRow | null;
  /** Partial releases need their own grant; a full close does not. */
  canPartial: boolean;
  onClose: () => void;
  onSubmit: (
    account: ClearingAccountRow,
    draft: SettlementDraft,
  ) => Promise<SettlementResult>;
};

/**
 * One-click settlement dialog opened from a party row.
 *
 * The amount is prefilled with the outstanding balance. A viewer who may only
 * close accounts does not send an amount at all, so the server registers a full
 * settlement rather than a partial one their grant does not cover.
 */
export function QuickSettleModal({
  open,
  account,
  canPartial,
  onClose,
  onSubmit,
}: QuickSettleModalProps) {
  const [amount, setAmount] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !account) return;
    setAmount(String(Math.abs(account.balance)));
    setReceiptNo("");
    setFile(null);
    setError("");
    setBusy(false);
  }, [open, account]);

  if (!account) return null;

  const collecting = account.balance > 0;
  const outstanding = operationMoney(
    Math.abs(account.balance),
    account.currency,
  );

  async function confirm() {
    if (!account) return;
    setBusy(true);
    setError("");
    const result = await onSubmit(account, {
      amount: canPartial ? amount : "",
      receiptNo,
      file,
    });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <Modal
      open={open}
      title={collecting ? "تحصيل مستحق" : "سداد مستحق"}
      eyebrow={account.partyName}
      description={`الرصيد المستحق: ${outstanding}`}
      onClose={onClose}
    >
      <div className="quick-settle-form">
        <TextField
          label="المبلغ"
          inputMode="decimal"
          dir="ltr"
          value={canPartial ? amount : String(Math.abs(account.balance))}
          disabled={!canPartial}
          hint={
            canPartial
              ? "عدّل المبلغ لتسوية جزئية، أو اتركه كاملاً."
              : "تسوية كاملة للرصيد."
          }
          onChange={(event) => setAmount(event.target.value)}
        />

        <TextField
          label="رقم الإيصال (اختياري)"
          value={receiptNo}
          onChange={(event) => setReceiptNo(event.target.value)}
        />

        <label className="clearing-receipt">
          <span>إيصال (اختياري)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions">
          <Button
            variant={collecting ? "primary" : "accent"}
            disabled={busy}
            onClick={confirm}
          >
            {busy
              ? "جارٍ التسجيل…"
              : collecting
                ? "تأكيد التحصيل"
                : "تأكيد السداد"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}
