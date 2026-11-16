"use client";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { useEffect, useState } from "react";

import type { ExpenseCategory, LedgerKind } from "@/lib/accounts/types";

type EntryFormProps = {
  accountId: string;
  currency: "EGP" | "SAR";
  defaultKind: LedgerKind;
  /** Allows the deposit side of the movement. */
  allowDeposit: boolean;
  /** Allows the expense side and reveals the category picker. */
  allowExpense: boolean;
  /** Active analytical buckets; an expense cannot be saved without one. */
  expenseCategories: ExpenseCategory[];
  /** Shows the inline "add category" workflow. */
  canManageCategories: boolean;
  onCategoriesChanged?: () => void;
  onDone: (message: string) => void;
};

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LedgerEntryForm({
  accountId,
  currency,
  defaultKind,
  allowDeposit,
  allowExpense,
  expenseCategories,
  canManageCategories,
  onCategoriesChanged,
  onDone,
}: EntryFormProps) {
  const [kind, setKind] = useState<LedgerKind>(defaultKind);
  const [categories, setCategories] = useState(expenseCategories);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newNameAr, setNewNameAr] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayInput);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCategories(expenseCategories);
  }, [expenseCategories]);

  async function addCategory() {
    setCategoryError("");
    setSavingCategory(true);
    try {
      const response = await fetch("/api/accounts/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameAr: newNameAr, nameEn: newNameEn }),
      });
      const payload = (await response.json()) as {
        category?: ExpenseCategory;
        error?: string;
      };
      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? "تعذر إضافة البند.");
      }
      setCategories((current) =>
        [...current, payload.category!].sort((left, right) =>
          left.nameAr.localeCompare(right.nameAr, "ar"),
        ),
      );
      setCategoryId(payload.category.id);
      setNewNameAr("");
      setNewNameEn("");
      setAdding(false);
      onCategoriesChanged?.();
    } catch (submitError) {
      setCategoryError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إضافة البند.",
      );
    } finally {
      setSavingCategory(false);
    }
  }

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
      <p className="field-hint">
        {currency === "SAR" ? "البنك السعودي · ريال" : "البنك المصري · جنيه"}
      </p>

      {allowDeposit && allowExpense ? (
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
        <div className="ledger-category">
          <SelectMenu
            label="البند الرئيسي"
            required
            value={categoryId}
            onChange={setCategoryId}
            placeholder="اختر بند المصروف"
            hint="يُستخدم في تقارير المصروفات."
            options={categories.map((category) => ({
              value: category.id,
              label: category.nameAr,
              hint: category.nameEn || undefined,
            }))}
          />

          {canManageCategories ? (
            <Button
              type="button"
              size="sm"
              variant="quiet"
              onClick={() => setAdding((current) => !current)}
            >
              {adding ? "إغلاق" : "+ إضافة بند جديد"}
            </Button>
          ) : null}

          {adding ? (
            <div className="ledger-category-create">
              <TextField
                label="اسم البند"
                value={newNameAr}
                onChange={(event) => setNewNameAr(event.target.value)}
                placeholder="مثال: مصروفات نقل"
                required
              />
              <TextField
                label="الاسم بالإنجليزية"
                hint="اختياري."
                value={newNameEn}
                onChange={(event) => setNewNameEn(event.target.value)}
                dir="ltr"
              />
              {categoryError ? (
                <p className="form-error" role="alert">
                  {categoryError}
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={savingCategory || newNameAr.trim().length < 2}
                onClick={() => void addCategory()}
              >
                {savingCategory ? "جارٍ الإضافة…" : "حفظ البند"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {kind === "expense" && categories.length === 0 ? (
        <p className="field-hint">
          لا توجد بنود مصروفات نشطة. أضف بنداً جديداً للمتابعة.
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
        disabled={saving || (kind === "expense" && categories.length === 0)}
      >
        {saving ? "جارٍ التسجيل…" : "تسجيل الحركة"}
      </Button>
    </form>
  );
}
