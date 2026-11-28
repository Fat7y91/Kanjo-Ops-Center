"use client";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menus";
import { TextField } from "@/components/ui/form-inputs";
import { useState } from "react";

import type { AccountCountry } from "@/lib/accounts/types";

type AccountFormProps = {
  onDone: (message: string) => void;
};

const COUNTRY_OPTIONS = [
  { value: "EG" as AccountCountry, label: "مصر — جنيه مصري" },
  { value: "SA" as AccountCountry, label: "السعودية — ريال سعودي" },
];

export function AccountForm({ onDone }: AccountFormProps) {
  const [country, setCountry] = useState<AccountCountry>("SA");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName,
          accountName,
          accountNumber,
          iban,
          country,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        account?: { bankName: string };
      };
      if (!response.ok) throw new Error(payload.error ?? "تعذر إضافة الحساب.");
      onDone(`تمت إضافة حساب ${payload.account?.bankName ?? bankName}.`);
      setBankName("");
      setAccountName("");
      setAccountNumber("");
      setIban("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إضافة الحساب.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <div className="account-form-grid">
        <SelectMenu
          label="الدولة"
          value={country}
          onChange={setCountry}
          options={COUNTRY_OPTIONS}
        />
        <TextField
          label="اسم البنك"
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          required
        />
        <TextField
          label="اسم الحساب"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          required
        />
        <TextField
          label="رقم الحساب"
          value={accountNumber}
          onChange={(event) => setAccountNumber(event.target.value)}
          inputMode="numeric"
          required
        />
        <TextField
          label="رقم الآيبان"
          value={iban}
          onChange={(event) => setIban(event.target.value.toUpperCase())}
          dir="ltr"
          required
        />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving}>
        {saving ? "جارٍ الحفظ…" : "إضافة الحساب"}
      </Button>
    </form>
  );
}
