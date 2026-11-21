"use client";

import { SelectMenu } from "@/components/ui/select-menus";
import { TextField } from "@/components/ui/form-inputs";
import {
  PAYOUT_METHODS,
  PAYOUT_METHOD_LABEL,
  type PayoutMethod,
  type PayoutPreferences,
} from "@/lib/couriers/payout";

/**
 * Flat form state for the payout destination.
 *
 * The domain value is a discriminated union, but a controlled form is easier to
 * drive as one flat object; `toPayout` narrows it back to the union on submit.
 */
export type PayoutForm = {
  method: PayoutMethod;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban: string;
  provider: string;
  walletPhone: string;
  instapayValue: string;
  postOffice: string;
  beneficiaryName: string;
};

const EMPTY: PayoutForm = {
  method: "bank_account",
  bankName: "",
  accountHolder: "",
  accountNumber: "",
  iban: "",
  provider: "",
  walletPhone: "",
  instapayValue: "",
  postOffice: "",
  beneficiaryName: "",
};

const METHOD_OPTIONS = PAYOUT_METHODS.map((value) => ({
  value,
  label: PAYOUT_METHOD_LABEL[value],
}));

/** Widens a stored destination (or null) into editable form state. */
export function payoutToForm(payout: PayoutPreferences | null): PayoutForm {
  if (!payout) return EMPTY;
  const base = { ...EMPTY, method: payout.method };
  switch (payout.method) {
    case "bank_account":
      return {
        ...base,
        bankName: payout.bankName,
        accountHolder: payout.accountHolder,
        accountNumber: payout.accountNumber,
        iban: payout.iban,
      };
    case "e_wallet":
      return { ...base, provider: payout.provider, walletPhone: payout.walletPhone };
    case "instapay":
      return { ...base, instapayValue: payout.instapayValue };
    case "egypt_post":
      return {
        ...base,
        postOffice: payout.postOffice,
        beneficiaryName: payout.beneficiaryName,
      };
  }
}

/** Narrows flat form state back to the union the API expects. */
export function formToPayout(form: PayoutForm): PayoutPreferences {
  switch (form.method) {
    case "bank_account":
      return {
        method: "bank_account",
        bankName: form.bankName.trim(),
        accountHolder: form.accountHolder.trim(),
        accountNumber: form.accountNumber.trim(),
        iban: form.iban.trim(),
      };
    case "e_wallet":
      return {
        method: "e_wallet",
        provider: form.provider.trim(),
        walletPhone: form.walletPhone.trim(),
      };
    case "instapay":
      return { method: "instapay", instapayValue: form.instapayValue.trim() };
    case "egypt_post":
      return {
        method: "egypt_post",
        postOffice: form.postOffice.trim(),
        beneficiaryName: form.beneficiaryName.trim(),
      };
  }
}

type PayoutFieldsProps = {
  value: PayoutForm;
  onChange: (patch: Partial<PayoutForm>) => void;
};

/** Method-specific destination inputs, rendered inside the shared form grid. */
export function PayoutFields({ value, onChange }: PayoutFieldsProps) {
  return (
    <>
      <SelectMenu
        label="طريقة الصرف"
        value={value.method}
        options={METHOD_OPTIONS}
        onChange={(next) => onChange({ method: next as PayoutMethod })}
      />

      {value.method === "bank_account" ? (
        <>
          <TextField
            label="اسم البنك"
            required
            value={value.bankName}
            onChange={(event) => onChange({ bankName: event.target.value })}
          />
          <TextField
            label="اسم صاحب الحساب"
            required
            value={value.accountHolder}
            onChange={(event) => onChange({ accountHolder: event.target.value })}
          />
          <TextField
            label="رقم الحساب"
            required
            dir="ltr"
            value={value.accountNumber}
            onChange={(event) => onChange({ accountNumber: event.target.value })}
          />
          <TextField
            label="IBAN"
            dir="ltr"
            value={value.iban}
            onChange={(event) => onChange({ iban: event.target.value })}
          />
        </>
      ) : null}

      {value.method === "e_wallet" ? (
        <>
          <TextField
            label="مزوّد المحفظة"
            required
            placeholder="فودافون كاش، اتصالات كاش…"
            value={value.provider}
            onChange={(event) => onChange({ provider: event.target.value })}
          />
          <TextField
            label="رقم المحفظة"
            required
            dir="ltr"
            value={value.walletPhone}
            onChange={(event) => onChange({ walletPhone: event.target.value })}
          />
        </>
      ) : null}

      {value.method === "instapay" ? (
        <TextField
          label="عنوان إنستاباي"
          required
          dir="ltr"
          value={value.instapayValue}
          onChange={(event) => onChange({ instapayValue: event.target.value })}
        />
      ) : null}

      {value.method === "egypt_post" ? (
        <>
          <TextField
            label="مكتب البريد"
            required
            value={value.postOffice}
            onChange={(event) => onChange({ postOffice: event.target.value })}
          />
          <TextField
            label="اسم المستفيد"
            required
            value={value.beneficiaryName}
            onChange={(event) => onChange({ beneficiaryName: event.target.value })}
          />
        </>
      ) : null}
    </>
  );
}
