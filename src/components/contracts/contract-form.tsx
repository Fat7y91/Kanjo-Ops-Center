"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import { ComboField, SelectMenu } from "@/components/ui/select-menus";
import type { ContractsPayload } from "@/lib/contracts/payload";
import type { Contract } from "@/lib/contracts/types";
import { CONTRACT_STATE_META } from "@/lib/field-ops/types";

type ContractFormProps = {
  contract?: Contract;
  merchants: ContractsPayload["merchants"];
  onDone: (message: string) => void;
};

const CURRENCIES = [
  { value: "EGP" as const, label: "جنيه مصري" },
  { value: "SAR" as const, label: "ريال سعودي" },
];

/**
 * The rate a draft should open with.
 *
 * A locked agreed rate wins; otherwise the merchant's target is the best
 * available starting point. Null keeps the field empty instead of implying a
 * zero-percent deal.
 */
function merchantRate(
  merchant: ContractsPayload["merchants"][number] | undefined,
): number | null {
  if (!merchant) return null;
  if (merchant.agreedCommission != null) return merchant.agreedCommission;
  if (merchant.targetCommission != null && merchant.targetCommission > 0) {
    return merchant.targetCommission;
  }
  return null;
}

/**
 * Draft / edit form.
 *
 * A draft picks a merchant from a searchable directory, which fixes its city;
 * an edit may not move the contract to another merchant, only restate terms.
 * Selecting a merchant fills the commission from its negotiated rate, so the
 * operator never has to look the percentage up or retype it. The submit path is
 * a create for a new contract and a PATCH for an existing one.
 */
export function ContractForm({ contract, merchants, onDone }: ContractFormProps) {
  const editing = Boolean(contract);
  const merchantOptions = merchants.map((merchant) => ({
    value: merchant.id,
    label: merchant.name,
    hint: merchant.vipMenu
      ? "VIP"
      : CONTRACT_STATE_META[merchant.state].labelAr,
  }));

  const initialMerchant =
    merchants.find((merchant) => merchant.id === contract?.merchantId) ??
    merchants[0];
  const [merchantId, setMerchantId] = useState(initialMerchant?.id ?? "");
  const [currency, setCurrency] = useState<Contract["currency"]>(
    contract?.currency ?? "EGP",
  );
  const [value, setValue] = useState(
    contract ? contract.value.toFixed(2) : "",
  );
  const initialRate = contract?.commissionRate ?? merchantRate(initialMerchant);
  const [commission, setCommission] = useState(
    initialRate != null ? String(initialRate) : "",
  );
  const [body, setBody] = useState(contract?.body ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function selectMerchant(nextId: string) {
    setMerchantId(nextId);
    const rate = merchantRate(
      merchants.find((merchant) => merchant.id === nextId),
    );
    if (rate != null) setCommission(String(rate));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const numericValue = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setError("أدخل قيمة عقد صحيحة.");
      return;
    }
    const numericCommission =
      commission.trim() === "" ? null : Number(commission);
    if (
      numericCommission !== null &&
      (!Number.isFinite(numericCommission) ||
        numericCommission < 0 ||
        numericCommission > 100)
    ) {
      setError("أدخل نسبة عمولة بين 0 و100.");
      return;
    }
    setSaving(true);
    try {
      const merchant = merchants.find((item) => item.id === merchantId);
      const payload = {
        merchantId,
        merchantName: merchant?.name ?? contract?.merchantName ?? "",
        cityId: merchant?.cityId ?? contract?.cityId ?? null,
        value: numericValue,
        currency,
        commissionRate: numericCommission,
        body,
      };

      const response = await fetch(
        editing ? `/api/contracts/${contract?.id}` : "/api/contracts",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "تعذر حفظ العقد.");
      }
      onDone(editing ? "تم تحديث العقد." : "تم إنشاء مسودة العقد.");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "تعذر حفظ العقد.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <div className="account-form-grid">
        <ComboField
          label="التاجر"
          value={merchantId || null}
          onChange={selectMerchant}
          options={merchantOptions}
          disabled={editing || merchantOptions.length === 0}
          placeholder={
            merchantOptions.length === 0
              ? "لا يوجد تجار في نطاقك"
              : "ابحث باسم التاجر…"
          }
        />
        <SelectMenu
          label="العملة"
          value={currency}
          onChange={setCurrency}
          options={CURRENCIES}
        />
        <TextField
          label="قيمة العقد"
          hint="القيمة الإجمالية للعقد."
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="0.00"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <TextField
          label="العمولة (%)"
          hint="تُعبّأ تلقائياً من النسبة المتفق عليها للتاجر وتُستخدم كأساس العقد."
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="0.01"
          dir="ltr"
          placeholder="0.00"
          value={commission}
          onChange={(event) => setCommission(event.target.value)}
        />
        <TextAreaField
          label="ملاحظات العقد"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          hint="البنود أو التفاصيل المتفق عليها."
        />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={saving || (!editing && merchantOptions.length === 0)}
      >
        {saving ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "إنشاء العقد"}
      </Button>
    </form>
  );
}
