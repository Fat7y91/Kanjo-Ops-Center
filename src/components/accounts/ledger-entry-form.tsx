"use client";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { useState } from "react";

import type { ExpenseCategory, LedgerKind } from "@/lib/accounts/types";

type EntryFormProps = {
  accountId: string;
  defaultKind: LedgerKind;
  /** Deposit-only viewers never see the expense switch. */
  allowExpense: boolean;
  /** Active analytical buckets; an expense cannot be saved without one. */
  expenseCategories: ExpenseCategory[];
  onDone: (message: string) => void;
};

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LedgerEntryForm({
  accountId,
  defaultKind,
  allowExpense,
  expenseCategories,
  onDone,
}: EntryFormProps) {
  const [kind, setKind] = useState<LedgerKind>(defaultKind);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayInput);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("أدخل مبلغاً أكبر من صفر.");
      return;
    }
    if (kind === "expense" && !categoryId) {
      setError("اختر البند الرئيسي للمصروف.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/accounts/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          kind,
          label,
          amount: parsed,
          occurredAt: new Date(`${occurredAt}T12:00:00.000Z`).toISOString(),
          categoryId: kind === "expense" ? categoryId : undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر تسجيل الحركة.");
      onDone(kind === "deposit" ? "تم تسجيل الإيداع." : "تم تسجيل المصروف.");
      setLabel("");
      setAmount("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر تسجيل الحركة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ledger-form" onSubmit={submit}>
      {allowExpense ? (
        <div className="ledger-kind" role="group" aria-label="نوع الحركة">
          <Button
            type="button"
            size="sm"
            variant={kind === "deposit" ? "primary" : "quiet"}
            onClick={() => setKind("deposit")}
          >
            إيداع
          </Button>
          <Button
            type="button"
            size="sm"
            variant={kind === "expense" ? "primary" : "quiet"}
            onClick={() => setKind("expense")}
          >
            مصروف
          </Button>
        </div>
      ) : null}

      {kind === "expense" ? (
        <SelectMenu
          label="البند الرئيسي"
          required
          value={categoryId}
          onChange={setCategoryId}
          placeholder="اختر بند المصروف"
          hint="يُستخدم في تقارير المصروفات."
          options={expenseCategories.map((category) => ({
            value: category.id,
            label: category.nameAr,
            hint: category.nameEn || undefined,
          }))}
        />
      ) : null}

      {kind === "expense" && expenseCategories.length === 0 ? (
        <p className="field-hint">
          لا توجد بنود مصروفات نشطة. أضف بنداً من إعدادات البنود أولاً.
        </p>
      ) : null}

      <TextField
        label="البيان"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        required
      />
      <TextField
        label="المبلغ"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="decimal"
        dir="ltr"
        required
      />
      <TextField
        label="التاريخ"
        type="date"
        value={occurredAt}
        onChange={(event) => setOccurredAt(event.target.value)}
        required
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={saving || (kind === "expense" && expenseCategories.length === 0)}
      >
        {saving ? "جارٍ التسجيل…" : "تسجيل الحركة"}
      </Button>
    </form>
  );
}
