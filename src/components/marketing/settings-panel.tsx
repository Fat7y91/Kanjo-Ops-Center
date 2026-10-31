"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField, ToggleField } from "@/components/ui/form-inputs";
import { PLATFORM_SPECS } from "@/lib/marketing/platforms";
import type { PlatformSettings } from "@/lib/marketing/types";

type SettingsPanelProps = {
  settings: PlatformSettings[];
  onDone: (message: string) => void;
};

type Draft = {
  enabled: boolean;
  webhookUrl: string;
  credentials: Record<string, string>;
};

export function SettingsPanel({ settings, onDone }: SettingsPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      settings.map((setting) => [
        setting.platform,
        {
          enabled: setting.enabled,
          webhookUrl: setting.webhookUrl,
          credentials: {},
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

  function patchCredential(platform: string, key: string, value: string) {
    setDrafts((current) => ({
      ...current,
      [platform]: {
        ...current[platform],
        credentials: { ...current[platform].credentials, [key]: value },
      },
    }));
  }

  async function save(platform: string, enabledOverride?: boolean) {
    const draft = drafts[platform];
    if (!draft) return;
    setBusy(platform);
    setError("");
    try {
      const response = await fetch("/api/marketing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          enabled: enabledOverride ?? draft.enabled,
          credentials: draft.credentials,
          webhookUrl: draft.webhookUrl,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر الحفظ.");
      if (enabledOverride !== undefined) {
        patch(platform, { enabled: enabledOverride });
      }
      patch(platform, { credentials: {} });
      onDone(enabledOverride ? "تم التحقق من الاتصال وتفعيل المزامنة." : "تم حفظ الإعدادات.");
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

      {PLATFORM_SPECS.map((spec) => {
        const setting = settings.find((item) => item.platform === spec.platform);
        const draft = drafts[spec.platform];
        if (!draft) return null;
        const configured = setting?.apiKeyConfigured ?? false;
        const isBusy = busy === spec.platform;

        return (
          <article className="marketing-setting" key={spec.platform}>
            <header>
              <h3>{spec.label}</h3>
              <span className={`badge ${configured ? "badge-green" : ""}`}>
                {spec.manualOnly
                  ? "إدخال يدوي"
                  : configured
                    ? "مفتاح موثّق"
                    : "بلا مفتاح"}
              </span>
            </header>

            <p className="marketing-spec-note">{spec.instructions}</p>

            {spec.manualOnly ? null : (
              <>
                {spec.fields.map((field) => (
                  <TextField
                    key={field.key}
                    label={field.label}
                    hint={
                      configured && !draft.credentials[field.key]
                        ? `${field.hint} اتركه فارغاً للاحتفاظ بالقيمة الحالية.`
                        : field.hint
                    }
                    type={field.secret ? "password" : "text"}
                    value={draft.credentials[field.key] ?? ""}
                    onChange={(event) =>
                      patchCredential(spec.platform, field.key, event.target.value)
                    }
                    dir="ltr"
                    autoComplete="off"
                    placeholder={field.patternHint}
                  />
                ))}

                <TextField
                  label="رابط الويب هوك"
                  value={draft.webhookUrl}
                  onChange={(event) =>
                    patch(spec.platform, { webhookUrl: event.target.value })
                  }
                  dir="ltr"
                  placeholder="https://"
                />

                <ToggleField
                  label="تفعيل المزامنة"
                  hint="لا يُفعّل إلا بعد التحقق من صحة بيانات الاتصال."
                  checked={draft.enabled}
                  onChange={(enabled) => void save(spec.platform, enabled)}
                  disabled={isBusy}
                />

                <Button
                  size="sm"
                  variant="quiet"
                  disabled={isBusy}
                  onClick={() => void save(spec.platform)}
                >
                  {isBusy ? "جارٍ التحقق…" : "حفظ الإعدادات"}
                </Button>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
