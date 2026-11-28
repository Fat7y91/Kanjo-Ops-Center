"use client";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { useState } from "react";

import { impliedRate } from "@/lib/accounts/fx";
import { currencyMoney } from "@/lib/accounts/format";

type FxTransferFormProps = {
  onDone: (message: string) => void;
};

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Manual SAR→EGP transfer entry.
 *
 * The finance admin captures the two amounts from the real transfer and
 * attaches its receipt. The implied rate is shown for confirmation only: it is
 * derived from the entered figures and is never posted, because the journal
 * records the money that actually moved.
 */
export function FxTransferForm({ onDone }: FxTransferFormProps) {
  const [sarAmount, setSarAmount] = useState("");
  const [egpAmount, setEgpAmount] = useState("");
  const [label, setLabel] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayInput);
  const [receiptNo, setReceiptNo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const sar = Number(sarAmount);
  const egp = Number(egpAmount);
  const rate = impliedRate(sar, egp);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isFinite(sar) || sar <= 0) {
      setError("أدخل مبلغ الريال المسحوب.");
      return;
    }
    if (!Number.isFinite(egp) || egp <= 0) {
      setError("أدخل مبلغ الجنيه المستلم.");
      return;
    }
    if (file && !receiptNo.trim()) {
      setError("أدخل رقم إيصال التحويل قبل إرفاق الملف.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      const form = new FormData();
      form.set("sarAmount", String(sar));
      form.set("egpAmount", String(egp));
      form.set("label", label);
      form.set("occurredAt", occurredAt);
      if (receiptNo.trim()) form.set("receiptNo", receiptNo.trim());
      if (file) form.set("file", file);

      const response = await fetch("/api/accounts/fx", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر تسجيل تحويل العملة.");
      }
      onDone("تم تسجيل تحويل العملة وإرفاق إيصاله.");
      setSarAmount("");
      setEgpAmount("");
      setLabel("");
      setReceiptNo("");
      setFile(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر تسجيل تحويل العملة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ledger-form" onSubmit={submit}>
      <p className="fx-summary" aria-live="polite">
        <span>من بنك الرياض (SAR)</span>
        <span>إلى البنك المصري (EGP)</span>
        {rate ? (
          <span className="fx-rate">
            سعر التحويل المحتسب: 1 SAR = {rate} EGP
          </span>
        ) : null}
      </p>

      <TextField
        label="مبلغ الريال المسحوب"
        value={sarAmount}
        onChange={(event) => setSarAmount(event.target.value)}
        inputMode="decimal"
        dir="ltr"
        required
      />
      <TextField
        label="مبلغ الجنيه المستلم"
        value={egpAmount}
        onChange={(event) => setEgpAmount(event.target.value)}
        inputMode="decimal"
        dir="ltr"
        required
      />
      {rate ? (
        <p className="fx-echo">
          {currencyMoney(sar, "SAR")} ← {currencyMoney(egp, "EGP")}
        </p>
      ) : null}

      <TextField
        label="البيان"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="تحويل عملة"
      />
      <TextField
        label="تاريخ التحويل"
        type="date"
        value={occurredAt}
        onChange={(event) => setOccurredAt(event.target.value)}
        required
      />
      <TextField
        label="رقم إيصال التحويل"
        value={receiptNo}
        onChange={(event) => setReceiptNo(event.target.value)}
        placeholder="اختياري"
      />
      <label className="fx-file">
        <span>إيصال التحويل</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving}>
        {saving ? "جارٍ التسجيل…" : "تسجيل التحويل"}
      </Button>
    </form>
  );
}
