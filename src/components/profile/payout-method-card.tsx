"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  PAYOUT_METHODS,
  PAYOUT_METHOD_LABEL,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_TONE,
  WALLET_PROVIDERS,
  payoutDestinationLabel,
  type PayoutMethod,
  type PayoutMethodRecord,
  type ReviewStatus,
} from "@/lib/profile/types";

const METHOD_OPTIONS = PAYOUT_METHODS.map((method) => ({
  value: method,
  label: PAYOUT_METHOD_LABEL[method],
}));

const WALLET_OPTIONS = WALLET_PROVIDERS.map((provider) => ({
  value: provider.value,
  label: provider.label,
}));

const INSTAPAY_OPTIONS = [
  { value: "ipa", label: "عنوان دفع IPA" },
  { value: "phone", label: "رقم هاتف" },
];

type Draft = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban: string;
  walletProvider: string;
  walletPhone: string;
  instapayType: string;
  instapayValue: string;
  postNationalId: string;
};

function draftFrom(record: PayoutMethodRecord | null): Draft {
  return {
    bankName: record?.bankName ?? "",
    accountHolder: record?.accountHolder ?? "",
    accountNumber: record?.accountNumber ?? "",
    iban: record?.iban ?? "",
    walletProvider: record?.walletProvider ?? WALLET_PROVIDERS[0].value,
    walletPhone: record?.walletPhone ?? "",
    instapayType: record?.instapayType ?? "ipa",
    instapayValue: record?.instapayValue ?? "",
    postNationalId: record?.postNationalId ?? "",
  };
}

export function PayoutMethodCard({
  initial,
}: {
  initial: PayoutMethodRecord | null;
}) {
  const [method, setMethod] = useState<PayoutMethod>(
    initial?.method ?? "bank_account",
  );
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [record, setRecord] = useState<PayoutMethodRecord | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
    setError("");
  }

  function bodyFor(nextMethod: PayoutMethod) {
    switch (nextMethod) {
      case "bank_account":
        return {
          method: nextMethod,
          bankName: draft.bankName,
          accountHolder: draft.accountHolder,
          accountNumber: draft.accountNumber,
          iban: draft.iban,
        };
      case "e_wallet":
        return {
          method: nextMethod,
          walletProvider: draft.walletProvider,
          walletPhone: draft.walletPhone,
        };
      case "instapay":
        return {
          method: nextMethod,
          instapayType: draft.instapayType,
          instapayValue: draft.instapayValue,
        };
      case "egypt_post":
        return {
          method: nextMethod,
          postNationalId: draft.postNationalId,
        };
    }
  }

  async function submit() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/profile/payout-method", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyFor(method)),
      });
      const payload = (await response.json()) as {
        payoutMethod?: PayoutMethodRecord;
        error?: string;
      };
      if (!response.ok || !payload.payoutMethod) {
        setError(payload.error ?? "تعذر حفظ بيانات الصرف.");
        return;
      }
      setRecord(payload.payoutMethod);
      setNotice(
        "تم حفظ بيانات الصرف. أي تعديل يعيدها إلى قائمة المراجعة.",
      );
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setSaving(false);
    }
  }

  const status: ReviewStatus = record?.status ?? "pending";

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>بيانات الصرف</h2>
          <p>الوجهة التي تُحوَّل إليها مستحقاتك. تُراجعها الإدارة المالية.</p>
        </div>
        <span className={`badge ${REVIEW_STATUS_TONE[status]}`}>
          {REVIEW_STATUS_LABEL[status]}
        </span>
      </header>

      {record ? (
        <p className="payout-current">
          الوجهة الحالية: <strong>{payoutDestinationLabel(record)}</strong>
        </p>
      ) : (
        <p className="payout-current">لم تُضف وجهة صرف بعد.</p>
      )}

      <Tabs
        showPanels={false}
        items={METHOD_OPTIONS.map((option) => ({
          id: option.value,
          label: option.label,
          content: null,
        }))}
        selectedIndex={PAYOUT_METHODS.indexOf(method)}
        onChange={(index) => {
          setMethod(PAYOUT_METHODS[index]);
          setNotice("");
          setError("");
        }}
      />

      <div className="form-grid payout-fields">
        {method === "bank_account" ? (
          <>
            <TextField
              label="اسم البنك"
              value={draft.bankName}
              onChange={(event) => patch("bankName", event.target.value)}
            />
            <TextField
              label="اسم صاحب الحساب"
              value={draft.accountHolder}
              onChange={(event) => patch("accountHolder", event.target.value)}
            />
            <TextField
              label="رقم الحساب"
              dir="ltr"
              value={draft.accountNumber}
              onChange={(event) => patch("accountNumber", event.target.value)}
            />
            <TextField
              label="رقم الآيبان"
              dir="ltr"
              hint="يبدأ بـ EG ويتكون من 29 خانة."
              value={draft.iban}
              onChange={(event) => patch("iban", event.target.value)}
            />
          </>
        ) : null}

        {method === "e_wallet" ? (
          <>
            <SelectMenu
              label="المحفظة"
              value={draft.walletProvider}
              options={WALLET_OPTIONS}
              onChange={(value) => patch("walletProvider", value)}
            />
            <TextField
              label="رقم المحفظة"
              dir="ltr"
              inputMode="numeric"
              hint="11 رقماً يبدأ بـ 01."
              value={draft.walletPhone}
              onChange={(event) => patch("walletPhone", event.target.value)}
            />
          </>
        ) : null}

        {method === "instapay" ? (
          <>
            <SelectMenu
              label="نوع البيانات"
              value={draft.instapayType}
              options={INSTAPAY_OPTIONS}
              onChange={(value) => patch("instapayType", value)}
            />
            <TextField
              label="قيمة إنستاباي"
              dir="ltr"
              value={draft.instapayValue}
              onChange={(event) => patch("instapayValue", event.target.value)}
            />
          </>
        ) : null}

        {method === "egypt_post" ? (
          <>
            <TextField
              label="الرقم القومي"
              dir="ltr"
              inputMode="numeric"
              hint="14 رقماً كما هو مسجّل في بطاقة بريد مصر."
              value={draft.postNationalId}
              onChange={(event) =>
                patch("postNationalId", event.target.value)
              }
            />
          </>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}

      <div className="form-actions">
        <Button variant="primary" disabled={saving} onClick={submit}>
          {saving ? "جارٍ الحفظ…" : "حفظ بيانات الصرف"}
        </Button>
      </div>
    </section>
  );
}
