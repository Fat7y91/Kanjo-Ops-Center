import { BI_MARKETING_PLATFORMS } from "@/lib/bi/types";

import {
  MARKETING_ENTRY_INPUT,
  PLATFORM_SETTINGS_INPUT,
  type MarketingEntry,
  type MarketingEntryInput,
  type PlatformSettings,
  type PlatformSettingsInput,
} from "./types";

export class MarketingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MarketingError";
    this.code = code;
    this.status = status;
  }
}

type MarketingStore = {
  entries: MarketingEntry[];
  settings: Map<string, PlatformSettings>;
  /** Raw keys, server-only, never serialized to a client. */
  secrets: Map<string, string>;
  revision: number;
};

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2MarketingStore?: MarketingStore;
};

function seedSettings(): Map<string, PlatformSettings> {
  return new Map(
    BI_MARKETING_PLATFORMS.map((platform) => [
      platform,
      {
        platform,
        enabled: false,
        apiKeyConfigured: false,
        webhookUrl: "",
        updatedAt: new Date(0).toISOString(),
      } satisfies PlatformSettings,
    ]),
  );
}

function getStore(): MarketingStore {
  if (!globalStore.__kanjoV2MarketingStore) {
    globalStore.__kanjoV2MarketingStore = {
      entries: [],
      settings: seedSettings(),
      secrets: new Map(),
      revision: 1,
    };
  }
  return globalStore.__kanjoV2MarketingStore;
}

export function listMarketingEntries(): MarketingEntry[] {
  return structuredClone(getStore().entries);
}

export function listPlatformSettings(): PlatformSettings[] {
  return Array.from(getStore().settings.values()).map((settings) => ({
    ...settings,
  }));
}

export function recordMarketingEntry(
  input: MarketingEntryInput,
  recordedBy: string,
): MarketingEntry {
  const parsed = MARKETING_ENTRY_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new MarketingError(
      "INVALID_ENTRY",
      "بيانات الإدخال التسويقي غير مكتملة أو غير صالحة.",
    );
  }
  const store = getStore();
  const entry: MarketingEntry = {
    id: `mkt-manual-${crypto.randomUUID().slice(0, 8)}`,
    platform: parsed.data.platform,
    campaign: parsed.data.campaign,
    cityId: parsed.data.cityId,
    spend: parsed.data.spend,
    impressions: parsed.data.impressions,
    clicks: parsed.data.clicks,
    conversions: parsed.data.conversions,
    occurredAt: parsed.data.occurredAt,
    recordedBy,
    recordedAt: new Date().toISOString(),
  };
  store.entries = [...store.entries, entry];
  store.revision += 1;
  return structuredClone(entry);
}

/**
 * Updates a platform's outbound settings.
 *
 * The API key is stored server-side only and surfaced as a boolean, so a key
 * can be replaced but never read back through the API.
 */
export function updatePlatformSettings(
  input: PlatformSettingsInput,
): PlatformSettings {
  const parsed = PLATFORM_SETTINGS_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new MarketingError(
      "INVALID_SETTINGS",
      "بيانات إعدادات المنصة غير صالحة.",
    );
  }
  const store = getStore();
  const next: PlatformSettings = {
    platform: parsed.data.platform,
    enabled: parsed.data.enabled,
    apiKeyConfigured:
      Boolean(parsed.data.apiKey && parsed.data.apiKey.length > 0) ||
      store.secrets.has(parsed.data.platform),
    webhookUrl: parsed.data.webhookUrl,
    updatedAt: new Date().toISOString(),
  };
  if (parsed.data.apiKey) {
    store.secrets.set(parsed.data.platform, parsed.data.apiKey);
  }
  store.settings.set(parsed.data.platform, next);
  store.revision += 1;
  return { ...next };
}
