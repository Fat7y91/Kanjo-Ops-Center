"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField, TextAreaField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { currencyMoney } from "@/lib/accounts/format";
import type { MarketingCampaign } from "@/lib/marketing/types";

type DailyEntryFormProps = {
  campaigns: MarketingCampaign[];
  onDone: (message: string) => void;
};

export function DailyEntryForm({ campaigns, onDone }: DailyEntryFormProps) {
  const active = campaigns.filter((campaign) => campaign.status !== "closed");
  const [campaignId, setCampaignId] = useState(active[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [spend, setSpend] = useState("");
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");
  const [leads, setLeads] = useState("");
  const [conversions, setConversions] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (active.length === 0) {
    return (
      <p className="marketing-locked">
        لا توجد حملة مفتوحة. أنشئ حملة أولاً لتسجيل نتائجها اليومية.
      </p>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/marketing/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          spend: Number(spend) || 0,
          impressions: Number(impressions) || 0,
          clicks: Number(clicks) || 0,
          leads: Number(leads) || 0,
          conversions: Number(conversions) || 0,
          occurredAt: new Date(`${occurredAt}T12:00:00.000Z`).toISOString(),
          note,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر حفظ الإدخال.");
      onDone("تم تسجيل نتائج اليوم.");
      setSpend("");
      setImpressions("");
      setClicks("");
      setLeads("");
      setConversions("");
      setNote("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ الإدخال.",
      );
    } finally {
      setSaving(false);
    }
  }

  const selected = active.find((campaign) => campaign.id === campaignId);

  return (
    <form className="marketing-entry-form" onSubmit={submit}>
      <div className="marketing-entry-grid">
        <SelectMenu
          label="الحملة"
          value={campaignId}
          onChange={setCampaignId}
          options={active.map((campaign) => ({
            value: campaign.id,
            label: campaign.name,
            hint: currencyMoney(campaign.budget, "EGP"),
          }))}
        />
        <TextField
          label="تاريخ النتيجة"
          type="date"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
          required
        />
        <TextField
          label="الإنفاق"
          hint="بالجنيه المصري."
          value={spend}
          onChange={(event) => setSpend(event.target.value)}
          inputMode="decimal"
          dir="ltr"
          required
        />
        <TextField
          label="الظهور"
          value={impressions}
          onChange={(event) => setImpressions(event.target.value)}
          inputMode="numeric"
          dir="ltr"
        />
        <TextField
          label="النقرات"
          value={clicks}
          onChange={(event) => setClicks(event.target.value)}
          inputMode="numeric"
          dir="ltr"
        />
        <TextField
          label="العملاء المحتملون"
          value={leads}
          onChange={(event) => setLeads(event.target.value)}
          inputMode="numeric"
          dir="ltr"
        />
        <TextField
          label="التحويلات"
          value={conversions}
          onChange={(event) => setConversions(event.target.value)}
          inputMode="numeric"
          dir="ltr"
        />
        <TextAreaField
          label="ملاحظة"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="اختياري."
        />
      </div>

      {selected ? (
        <p className="field-hint">
          الميزانية المعتمدة {currencyMoney(selected.budget, "EGP")} · الهدف{" "}
          {selected.targetLeads.toLocaleString("en-US")} عميل محتمل
        </p>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? "جارٍ الحفظ…" : "حفظ نتائج اليوم"}
      </Button>
    </form>
  );
}
