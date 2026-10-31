"use client";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { ToggleField } from "@/components/ui/form-inputs";
import { useState } from "react";

import type { PlatformSettings } from "@/lib/marketing/types";
import { BI_MARKETING_PLATFORM_META } from "@/lib/bi/types";

type SettingsPanelProps = {
  settings: PlatformSettings[];
  onDone: (message: string) => void;
};

type Draft = {
  enabled: boolean;
  apiKey: string;
  webhookUrl: string;
};

export function SettingsPanel({ settings, onDone }: SettingsPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      settings.map((setting) => [
        setting.platform,
        {
          enabled: setting.enabled,
          apiKey: "",
          webhookUrl: setting.webhookUrl,
        },
      ]),
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  function patch(platform: string, next: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [platform]: { ...current[platform], ...next },
    }));
  }

  async function save(platform: string) {
    setBusy(platform);
    setError("");
    try {
      const draft = drafts[platform];
      const response = await fetch("/api/marketing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          enabled: draft.enabled,
          apiKey: draft.apiKey || undefined,
          webhookUrl: draft.webhookUrl,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر الحفظ.");
      onDone(`تم تحديث إعدادات ${BI_MARKETING_PLATFORM_META[platform as keyof typeof BI_MARKETING_PLATFORM_META]}.`);
      patch(platform, { apiKey: "" });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "تعذر الحفظ.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="marketing-settings">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {settings.map((setting) => {
        const draft = drafts[setting.platform];
        if (!draft) return null;
        return (
          <article className="marketing-setting" key={setting.platform}>
            <header>
              <h3>{BI_MARKETING_PLATFORM_META[setting.platform]}</h3>
              <span className="badge">
                {setting.apiKeyConfigured ? "مفتاح مُهيّأ" : "بلا مفتاح"}
              </span>
            </header>

            <ToggleField
              label="تفعيل المزامنة"
              checked={draft.enabled}
              onChange={(enabled) => patch(setting.platform, { enabled })}
            />

            <TextField
              label="مفتاح API"
              hint={
                setting.apiKeyConfigured
                  ? "اتركه فارغاً للاحتفاظ بالمفتاح الحالي."
                  : "أدخل مفتاح المنصة."
              }
              type="password"
              value={draft.apiKey}
              onChange={(event) =>
                patch(setting.platform, { apiKey: event.target.value })
              }
              dir="ltr"
              autoComplete="off"
            />

            <TextField
              label="رابط الويب هوك"
              value={draft.webhookUrl}
              onChange={(event) =>
                patch(setting.platform, { webhookUrl: event.target.value })
              }
              dir="ltr"
              placeholder="https://"
            />

            <Button
              size="sm"
              variant="quiet"
              disabled={busy === setting.platform}
              onClick={() => save(setting.platform)}
            >
              {busy === setting.platform ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
