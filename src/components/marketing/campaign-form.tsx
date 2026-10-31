"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  BI_MARKETING_CHANNELS,
  BI_MARKETING_META,
  BI_MARKETING_PLATFORMS,
  BI_MARKETING_PLATFORM_META,
  type BiMarketingChannel,
  type BiMarketingPlatform,
} from "@/lib/bi/types";
import type { CampaignInput } from "@/lib/marketing/types";

type CampaignFormProps = {
  cities: { id: string; name: string }[];
  onDone: (message: string) => void;
};

const ALL_CITIES = "all";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export function CampaignForm({ cities, onDone }: CampaignFormProps) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<BiMarketingPlatform>("meta");
  const [channel, setChannel] = useState<BiMarketingChannel>("instagram");
  const [cityId, setCityId] = useState(ALL_CITIES);
  const [budget, setBudget] = useState("");
  const [targetLeads, setTargetLeads] = useState("");
  const [targetConversions, setTargetConversions] = useState("");
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(inDays(30));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload: CampaignInput = {
        name,
        platform,
        channel,
        cityId: cityId === ALL_CITIES ? null : cityId,
        budget: Number(budget) || 0,
        targetLeads: Number(targetLeads) || 0,
        targetConversions: Number(targetConversions) || 0,
        startsOn,
        endsOn,
      };
      const response = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "تعذر إنشاء الحملة.");
      onDone(`تم إنشاء الحملة «${name}».`);
      setName("");
      setBudget("");
      setTargetLeads("");
      setTargetConversions("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إنشاء الحملة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="marketing-entry-form" onSubmit={submit}>
      <div className="marketing-entry-grid">
        <TextField
          label="اسم الحملة"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <SelectMenu
          label="المنصة"
          value={platform}
          onChange={setPlatform}
          options={BI_MARKETING_PLATFORMS.map((value) => ({
            value,
            label: BI_MARKETING_PLATFORM_META[value],
          }))}
        />
        <SelectMenu
          label="القناة"
          value={channel}
          onChange={setChannel}
          options={BI_MARKETING_CHANNELS.map((value) => ({
            value,
            label: BI_MARKETING_META[value],
          }))}
        />
        <SelectMenu
          label="المدينة"
          value={cityId}
          onChange={setCityId}
          options={[
            { value: ALL_CITIES, label: "كل المدن" },
            ...cities.map((city) => ({ value: city.id, label: city.name })),
          ]}
        />
        <TextField
          label="الميزانية"
          hint="بالجنيه المصري."
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          inputMode="decimal"
          dir="ltr"
          required
        />
        <Field label="أهداف الحملة">
          <div className="marketing-targets">
            <TextField
              label="عملاء محتملون"
              value={targetLeads}
              onChange={(event) => setTargetLeads(event.target.value)}
              inputMode="numeric"
              dir="ltr"
            />
            <TextField
              label="تحويلات"
              value={targetConversions}
              onChange={(event) => setTargetConversions(event.target.value)}
              inputMode="numeric"
              dir="ltr"
            />
          </div>
        </Field>
        <TextField
          label="تاريخ البداية"
          type="date"
          value={startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
          required
        />
        <TextField
          label="تاريخ النهاية"
          type="date"
          value={endsOn}
          onChange={(event) => setEndsOn(event.target.value)}
          required
        />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? "جارٍ الإنشاء…" : "إنشاء الحملة"}
      </Button>
    </form>
  );
}
