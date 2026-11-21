"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField, TextAreaField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import {
  CAPITAL_STATUS_LABEL,
  type CapitalDeposit,
} from "@/lib/profile/capital";

import { uploadProfileFile } from "./use-profile";

const CURRENCIES = [
  { value: "EGP" as const, label: "جنيه مصري (EGP)" },
  { value: "SAR" as const, label: "ريال سعودي (SAR)" },
];

const TONE: Record<CapitalDeposit["status"], string> = {
  pending: "badge-gold",
  approved: "badge-green",
  rejected: "badge-red",
};

export function CapitalDepositCard({
  initialDeposits,
}: {
  initialDeposits: CapitalDeposit[];
}) {
  const [deposits, setDeposits] = useState(initialDeposits);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"EGP" | "SAR">("EGP");
  const [note, setNote] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function onPickReceipt(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const stored = await uploadProfileFile("capital-receipts", file);
      setReceiptPath(stored.path);
      setReceiptName(file.name);
    } catch (uploadFailure) {
      setError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : "تعذر رفع الإيصال.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/capital-deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, note, receiptPath }),
      });
      const payload = (await response.json()) as {
        deposit?: CapitalDeposit;
        error?: string;
      };
      if (!response.ok || !payload.deposit) {
        setError(payload.error ?? "تعذر تسجيل الإيداع.");
        return;
      }
      setDeposits((current) => [payload.deposit!, ...current]);
      setAmount("");
      setNote("");
      setReceiptPath(null);
      setReceiptName("");
      setNotice("تم تسجيل الإيداع. ينتظر اعتماد الإدارة المالية.");
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>إيداع رأسمالي</h2>
          <p>
            سجّل رأس المال الداخل إلى الشركة مع إيصال التحويل. يُقيَّد في الخزينة
            بعد اعتماد الإدارة المالية فقط.
          </p>
        </div>
      </header>

      <div className="form-grid">
        <TextField
          label="المبلغ"
          inputMode="decimal"
          dir="ltr"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <SelectMenu
          label="العملة"
          value={currency}
          options={CURRENCIES}
          onChange={(value) => setCurrency(value)}
        />
        <TextAreaField
          label="ملاحظة"
          rows={2}
          maxLength={280}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="receipt-picker">
        <label className="button button-quiet button-small profile-file">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={uploading}
            onChange={(event) => onPickReceipt(event.target.files?.[0] ?? null)}
          />
          {uploading ? "جارٍ الرفع…" : "إرفاق إيصال"}
        </label>
        {receiptName ? (
          <span className="receipt-name">
            {receiptName}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReceiptPath(null);
                setReceiptName("");
              }}
            >
              إزالة
            </Button>
          </span>
        ) : (
          <span className="receipt-name muted">
            صورة أو PDF حتى 5 ميجابايت.
          </span>
        )}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}

      <div className="form-actions">
        <Button variant="primary" disabled={saving || uploading} onClick={submit}>
          {saving ? "جارٍ التسجيل…" : "تسجيل الإيداع"}
        </Button>
      </div>

      <div className="capital-history">
        <h3>إيداعاتي</h3>
        {deposits.length === 0 ? (
          <p className="muted">لا توجد إيداعات مسجّلة بعد.</p>
        ) : (
          <ul className="capital-list">
            {deposits.map((deposit) => (
              <li key={deposit.id}>
                <div>
                  <strong>
                    {currencyMoney(deposit.amount / 100, deposit.currency)}
                  </strong>
                  <span className="muted">
                    {shortDate(deposit.createdAt)}
                    {deposit.note ? ` · ${deposit.note}` : ""}
                  </span>
                </div>
                <span className={`badge ${TONE[deposit.status]}`}>
                  {CAPITAL_STATUS_LABEL[deposit.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
