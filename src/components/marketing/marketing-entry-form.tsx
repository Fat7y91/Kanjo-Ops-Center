"use client";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { useState } from "react";

import {
  BI_MARKETING_PLATFORMS,
  BI_MARKETING_PLATFORM_META,
  type BiMarketingPlatform,
} from "@/lib/bi/types";

type MarketingEntryFormProps = {
  cities: { id: string; name: string }[];
  onDone: (message: string) => void;
};

export function MarketingEntryForm({
  cities,
  onDone,
}: MarketingEntryFormProps) {
  const [platform, setPlatform] = useState<BiMarketingPlatform>("meta");
  const [campaign, setCampaign] = useState("");
  const [cityId, setCityId] = useState("");
  const [spend, setSpend] = useState("");
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");
  const [conversions, setConversions] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/marketing/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          campaign,
          cityId: cityId || null,
          spend: Number(spend) || 0,
          impressions: Number(impressions) || 0,
          clicks: Number(clicks) || 0,
          conversions: Number(conversions) || 0,
          occurredAt: new Date(`${occurredAt}T12:00:00.000Z`).toISOString(),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر حفظ الإدخال.");
      onDone("تم تسجيل بيانات الحملة.");
      setCampaign("");
      setSpend("");
      setImpressions("");
      setClicks("");
      setConversions("");
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

  return (
    <form className="marketing-entry-form" onSubmit={submit}>
      <div className="marketing-entry-grid">
        <SelectMenu
          label="المنصة"
          value={platform}
          onChange={setPlatform}
          options={BI_MARKETING_PLATFORMS.map((value) => ({
            value,
            label: BI_MARKETING_PLATFORM_META[value],
          }))}
        />
        <TextField
          label="اسم الحملة"
          value={campaign}
          onChange={(event) => setCampaign(event.target.value)}
          required
        />
        <SelectMenu
          label="المدينة"
          value={cityId || "all"}
          onChange={(value) => setCityId(value === "all" ? "" : value)}
          options={[
            { value: "all", label: "كل المدن" },
            ...cities.map((city) => ({ value: city.id, label: city.name })),
          ]}
        />
        <TextField
          label="الإنفاق"
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
          label="التحويلات"
          value={conversions}
          onChange={(event) => setConversions(event.target.value)}
          inputMode="numeric"
          dir="ltr"
        />
        <TextField
          label="التاريخ"
          type="date"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
          required
        />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving}>
        {saving ? "جارٍ الحفظ…" : "حفظ الإدخال"}
      </Button>
    </form>
  );
}
