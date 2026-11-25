"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { operationMoney } from "@/lib/operations/format";
import type { PartyStatement } from "@/lib/operations/types";
import type { AdjustmentDirection } from "@/lib/operations/manual-adjustment";

type ManualAdjustmentModalProps = {
  open: boolean;
  statement: PartyStatement | null;
  onClose: () => void;
  onPosted: () => void;
};

const DIRECTIONS: {
  value: AdjustmentDirection;
  label: string;
  hint: string;
}[] = [
  {
    value: "credit",
    label: "مكافأة / إضافة مستحقات للطرف",
    hint: "تزيد المستحق للطرف أو تقلل المطلوب منه.",
  },
  {
    value: "debit",
    label: "خصم / تسوية مدينة على الطرف",
    hint: "تخصم من رصيد الطرف أو تزيد المطلوب منه.",
  },
];

function cairoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function ManualAdjustmentModal({
  open,
  statement,
  onClose,
  onPosted,
}: ManualAdjustmentModalProps) {
  const [direction, setDirection] = useState<AdjustmentDirection>("credit");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(cairoToday());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDirection("credit");
    setAmount("");
    setEntryDate(cairoToday());
    setReason("");
    setError("");
    setBusy(false);
  }, [open]);

  if (!statement) return null;

  const currency = statement.currency;
  const balance = operationMoney(Math.abs(statement.balance), currency);

  async function submit() {
    if (!statement) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("أدخل مبلغاً صحيحاً أكبر من صفر.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("اكتب تفسيراً واضحاً للمكافأة أو التسوية.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/clearinghouse/accounts/${statement.accountId}/adjustments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction,
            amount: parsed,
            entryDate,
            reason: reason.trim(),
          }),
        },
      );
      const payload = (await response.json()) as {
        entryId?: string;
        error?: string;
      };
      if (!response.ok || !payload.entryId) {
        setError(payload.error ?? "تعذر تسجيل المكافأة أو التسوية.");
        return;
      }
      onPosted();
      onClose();
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="إضافة مكافأة أو تسوية مالية يدوية"
      eyebrow={statement.partyName}
      description={`الرصيد الحالي: ${balance}`}
      onClose={onClose}
    >
      <div className="manual-adjustment-form">
        <SelectMenu
          label="نوع الحركة"
          value={direction}
          onChange={(value) => setDirection(value as AdjustmentDirection)}
          options={DIRECTIONS}
        />

        <div className="manual-adjustment-grid">
          <TextField
            label="المبلغ (ج.م.)"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
          <TextField
            label="تاريخ الحركة / يوم العمل"
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
            required
          />
        </div>

        <TextAreaField
          label="التفسير / سبب المكافأة أو التسوية"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="مثال: مكافأة التزام وحسن تعامل مع العميل وحل مشكلة طلب #149571"
          required
        />

        <p className="manual-adjustment-note">
          {direction === "credit"
            ? "سيُسجل القيد: مدين مصروف المكافآت / دائن حساب الطرف."
            : "سيُسجل القيد: مدين حساب الطرف / دائن إيرادات وتسويات تشغيلية."}
        </p>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions">
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "جارٍ التسجيل…" : "تسجيل الحركة"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}
