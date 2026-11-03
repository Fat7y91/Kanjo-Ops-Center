"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { MerchantV1Profile } from "@/lib/field-ops/types";

type UseMerchantV1ProfileArgs = {
  merchantId: string;
  profile: MerchantV1Profile;
  onAnnounce: (message: string) => void;
};

type FlagKey = "appPublished" | "vipMenu";

const SOCIAL_FIELDS = [
  "actualAddress",
  "facebookUrl",
  "instagramUrl",
] as const;

type SocialField = (typeof SOCIAL_FIELDS)[number];

/**
 * View state for the merchant V1 panel.
 *
 * Every save sends only the fields it changed, so the server can authorise each
 * field against its own capability and a socials edit can never accidentally
 * rewrite the publish flag.
 */
export function useMerchantV1Profile({
  merchantId,
  profile,
  onAnnounce,
}: UseMerchantV1ProfileArgs) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<SocialField, string>>({
    actualAddress: profile.actualAddress,
    facebookUrl: profile.facebookUrl,
    instagramUrl: profile.instagramUrl,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(field: SocialField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/field-ops/merchants/${merchantId}/profile`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر حفظ بيانات التاجر.");
      }
      onAnnounce("تم تحديث بيانات التاجر.");
      router.refresh();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر حفظ بيانات التاجر.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveSocials(): Promise<boolean> {
    return patch({
      actualAddress: draft.actualAddress.trim(),
      facebookUrl: draft.facebookUrl.trim(),
      instagramUrl: draft.instagramUrl.trim(),
    });
  }

  async function toggleFlag(field: FlagKey, value: boolean): Promise<void> {
    await patch({ [field]: value });
  }

  return { draft, setField, saveSocials, toggleFlag, saving, error };
}
