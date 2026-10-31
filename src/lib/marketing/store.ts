import { BI_MARKETING_PLATFORMS } from "@/lib/bi/types";

import { verifyPlatformCredentials } from "./platforms";
import {
  CAMPAIGN_INPUT,
  CAMPAIGN_STATUS_INPUT,
  MARKETING_ENTRY_INPUT,
  PLATFORM_SETTINGS_INPUT,
  type CampaignInput,
  type CampaignProgress,
  type MarketingCampaign,
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
  campaigns: MarketingCampaign[];
  entries: MarketingEntry[];
  settings: Map<string, PlatformSettings>;
  /** Encrypted-at-rest in Postgres; process-local here, never serialized. */
  secrets: Map<string, Record<string, string>>;
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
      campaigns: [],
      entries: [],
      settings: seedSettings(),
      secrets: new Map(),
      revision: 1,
    };
  }
  return globalStore.__kanjoV2MarketingStore;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

export function listCampaigns(): MarketingCampaign[] {
  return structuredClone(getStore().campaigns);
}

export function listMarketingEntries(campaignId?: string): MarketingEntry[] {
  const entries = structuredClone(getStore().entries);
  return campaignId
    ? entries.filter((entry) => entry.campaignId === campaignId)
    : entries;
}

export function listPlatformSettings(): PlatformSettings[] {
  return Array.from(getStore().settings.values()).map((settings) => ({
    ...settings,
  }));
}

export function campaignProgress(): CampaignProgress[] {
  const store = getStore();
  const today = new Date().toISOString();
  return store.campaigns.map((campaign) => {
    const expenses = store.entries.filter(
      (entry) => entry.campaignId === campaign.id,
    );
    const spend = expenses.reduce((total, entry) => total + entry.spend, 0);
    return {
      campaign,
      spend,
      spentShare: campaign.budget === 0 ? 0 : spend / campaign.budget,
      leads: expenses.reduce((total, entry) => total + entry.leads, 0),
      conversions: expenses.reduce(
        (total, entry) => total + entry.conversions,
        0,
      ),
      daysRun: daysBetween(campaign.startsOn, today),
      daysLeft:
        campaign.status === "closed"
          ? 0
          : daysBetween(today, campaign.endsOn),
    };
  });
}

export function createCampaign(
  input: CampaignInput,
  createdBy: string,
): MarketingCampaign {
  const parsed = CAMPAIGN_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new MarketingError(
      "INVALID_CAMPAIGN",
      parsed.error.errors[0]?.message ?? "بيانات الحملة غير مكتملة.",
    );
  }
  const store = getStore();
  const campaign: MarketingCampaign = {
    id: `cmp-${crypto.randomUUID().slice(0, 8)}`,
    name: parsed.data.name,
    platform: parsed.data.platform,
    channel: parsed.data.channel,
    cityId: parsed.data.cityId,
    budget: parsed.data.budget,
    targetLeads: parsed.data.targetLeads,
    targetConversions: parsed.data.targetConversions,
    startsOn: parsed.data.startsOn,
    endsOn: parsed.data.endsOn,
    status: "active",
    createdBy,
    createdAt: new Date().toISOString(),
    closedAt: null,
  };
  store.campaigns = [campaign, ...store.campaigns];
  store.revision += 1;
  return structuredClone(campaign);
}

export function setCampaignStatus(
  campaignId: string,
  rawStatus: unknown,
): MarketingCampaign {
  const parsed = CAMPAIGN_STATUS_INPUT.safeParse(rawStatus);
  if (!parsed.success) {
    throw new MarketingError("INVALID_STATUS", "حالة الحملة غير صالحة.");
  }
  const store = getStore();
  const campaign = store.campaigns.find((item) => item.id === campaignId);
  if (!campaign) {
    throw new MarketingError("CAMPAIGN_NOT_FOUND", "الحملة غير موجودة.", 404);
  }
  if (campaign.status === "closed") {
    throw new MarketingError(
      "CAMPAIGN_CLOSED",
      "الحملة منتهية ولا يمكن تغيير حالتها.",
      409,
    );
  }
  campaign.status = parsed.data.status;
  campaign.closedAt =
    parsed.data.status === "closed" ? new Date().toISOString() : null;
  store.revision += 1;
  return structuredClone(campaign);
}

export function recordMarketingEntry(
  input: MarketingEntryInput,
  recordedBy: string,
): MarketingEntry {
  const parsed = MARKETING_ENTRY_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new MarketingError(
      "INVALID_ENTRY",
      parsed.error.errors[0]?.message ??
        "بيانات الإدخال التسويقي غير مكتملة أو غير صالحة.",
    );
  }
  const store = getStore();
  const campaign = store.campaigns.find(
    (item) => item.id === parsed.data.campaignId,
  );
  if (!campaign) {
    throw new MarketingError("CAMPAIGN_NOT_FOUND", "الحملة غير موجودة.", 404);
  }
  if (campaign.status === "closed") {
    throw new MarketingError(
      "CAMPAIGN_CLOSED",
      "الحملة منتهية ولا تستقبل نتائج جديدة.",
      409,
    );
  }
  if (parsed.data.clicks > parsed.data.impressions) {
    throw new MarketingError(
      "INVALID_ENTRY",
      "النقرات لا يمكن أن تتجاوز مرات الظهور.",
    );
  }
  if (parsed.data.conversions > parsed.data.clicks) {
    throw new MarketingError(
      "INVALID_ENTRY",
      "التحويلات لا يمكن أن تتجاوز النقرات.",
    );
  }
  if (parsed.data.leads > parsed.data.clicks) {
    throw new MarketingError(
      "INVALID_ENTRY",
      "العملاء المحتملون لا يمكن أن يتجاوزوا النقرات.",
    );
  }

  const entry: MarketingEntry = {
    id: `mkt-day-${crypto.randomUUID().slice(0, 8)}`,
    campaignId: campaign.id,
    spend: parsed.data.spend,
    impressions: parsed.data.impressions,
    clicks: parsed.data.clicks,
    leads: parsed.data.leads,
    conversions: parsed.data.conversions,
    occurredAt: parsed.data.occurredAt,
    note: parsed.data.note ?? "",
    recordedBy,
    recordedAt: new Date().toISOString(),
  };
  store.entries = [...store.entries, entry];
  store.revision += 1;
  return structuredClone(entry);
}

/**
 * Updates a platform's integration settings.
 *
 * Switching sync on runs the credential verifier first; a rejected key never
 * reaches a stored row, so `enabled` always means "verified and connected".
 * Credential values are write-only and surfaced only as `apiKeyConfigured`.
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
  const previous = store.secrets.get(parsed.data.platform) ?? {};
  const merged = { ...previous };

  for (const [key, value] of Object.entries(parsed.data.credentials)) {
    const trimmed = value.trim();
    if (trimmed !== "") merged[key] = trimmed;
  }

  const configured = Object.keys(merged).length > 0;

  if (parsed.data.enabled) {
    const verification = verifyPlatformCredentials(
      parsed.data.platform,
      merged,
    );
    if (!verification.ok) {
      throw new MarketingError("CREDENTIALS_UNVERIFIED", verification.error, 422);
    }
  }

  const next: PlatformSettings = {
    platform: parsed.data.platform,
    enabled: parsed.data.enabled,
    apiKeyConfigured: configured,
    webhookUrl: parsed.data.webhookUrl,
    updatedAt: new Date().toISOString(),
  };

  store.secrets.set(parsed.data.platform, merged);
  store.settings.set(parsed.data.platform, next);
  store.revision += 1;
  return { ...next };
}
