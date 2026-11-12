"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
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
 * Draft / edit form.
 *
 * A draft picks a merchant from the scoped directory, which fixes its city; an
 * edit may not move the contract to another merchant, only restate terms. The
 * submit path is a create for a new contract and a PATCH for an existing one.
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

  const [merchantId, setMerchantId] = useState(
    contract?.merchantId ?? merchants[0]?.id ?? "",
  );
  const [currency, setCurrency] = useState<Contract["currency"]>(
    contract?.currency ?? "EGP",
  );
  const [signatory, setSignatory] = useState(contract?.signatory ?? "");
  const [body, setBody] = useState(contract?.body ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const merchant = merchants.find((item) => item.id === merchantId);
      const payload = {
        merchantId,
        merchantName: merchant?.name ?? contract?.merchantName ?? "",
        cityId: merchant?.cityId ?? contract?.cityId ?? null,
        currency,
        signatory,
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
        <SelectMenu
          label="التاجر"
          value={merchantId}
          onChange={setMerchantId}
          options={merchantOptions}
          disabled={editing || merchantOptions.length === 0}
          placeholder={
            merchantOptions.length === 0 ? "لا يوجد تجار في نطاقك" : undefined
          }
        />
        <SelectMenu
          label="العملة"
          value={currency}
          onChange={setCurrency}
          options={CURRENCIES}
        />
        <TextField
          label="الجهة الموقّعة"
          hint="اتركه فارغاً إن لم تُحدَّد بعد."
          value={signatory}
          onChange={(event) => setSignatory(event.target.value)}
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
