import { BI_MARKETING_PLATFORMS } from "@/lib/bi/types";

import { verifyPlatformCredentials } from "./platforms";
import {
  insertCampaignRow,
  insertMarketingEntryRow,
  isMarketingDatabaseConfigured,
  listCampaignRows,
  listMarketingEntryRows,
  listPlatformSettingsRows,
  readPlatformCredentials,
  updateCampaignStatusRow,
  upsertPlatformSettingsRow,
} from "./repository";
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

/**
 * Tier 3 marketing rules over the Tier 4 repository.
 *
 * Campaigns and daily results are durable rows, so two workers can no longer
 * disagree about a budget or lose a day's spend when an isolate restarts. The
 * rules that used to guard the in-memory maps (window order, click/lead
 * invariants, terminal closed state) are still enforced here even though SQL
 * repeats them, because a client must receive a named error, not a 500.
 */

export function isMarketingConfigured(): boolean {
  return isMarketingDatabaseConfigured();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

export async function listCampaigns(): Promise<MarketingCampaign[]> {
  return listCampaignRows();
}

export async function listMarketingEntries(
  campaignId?: string,
): Promise<MarketingEntry[]> {
  return listMarketingEntryRows(campaignId);
}

export async function listPlatformSettings(): Promise<PlatformSettings[]> {
  const stored = await listPlatformSettingsRows();

  // Every platform must have a row so the settings panel can render an
  // unconfigured network without the operator first creating it.
  const byPlatform = new Map(stored.map((item) => [item.platform, item]));
  return BI_MARKETING_PLATFORMS.map(
    (platform) =>
      byPlatform.get(platform) ?? {
        platform,
        enabled: false,
        apiKeyConfigured: false,
        webhookUrl: "",
        updatedAt: new Date(0).toISOString(),
      },
  );
}

export async function campaignProgress(): Promise<CampaignProgress[]> {
  const [campaigns, entries] = await Promise.all([
    listCampaignRows(),
    listMarketingEntryRows(),
  ]);
  const today = new Date().toISOString();

  return campaigns.map((campaign) => {
    const spendEntries = entries.filter(
      (entry) => entry.campaignId === campaign.id,
    );
    const spend = spendEntries.reduce((total, entry) => total + entry.spend, 0);
    return {
      campaign,
      spend,
      spentShare: campaign.budget === 0 ? 0 : spend / campaign.budget,
      leads: spendEntries.reduce((total, entry) => total + entry.leads, 0),
      conversions: spendEntries.reduce(
        (total, entry) => total + entry.conversions,
        0,
      ),
      daysRun: daysBetween(campaign.startsOn, today),
      daysLeft:
        campaign.status === "closed" ? 0 : daysBetween(today, campaign.endsOn),
    };
  });
}

export async function createCampaign(
  input: CampaignInput,
  createdBy: string,
): Promise<MarketingCampaign> {
  const parsed = CAMPAIGN_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new MarketingError(
      "INVALID_CAMPAIGN",
      parsed.error.errors[0]?.message ?? "بيانات الحملة غير مكتملة.",
    );
  }
  if (!isMarketingConfigured()) {
    throw new MarketingError(
      "STORE_UNAVAILABLE",
      "بيانات الحملات غير مُفعّلة على هذا النشر بعد.",
      503,
    );
  }
  return insertCampaignRow(parsed.data, createdBy);
}

export async function setCampaignStatus(
  campaignId: string,
  rawStatus: unknown,
): Promise<MarketingCampaign> {
  const parsed = CAMPAIGN_STATUS_INPUT.safeParse(rawStatus);
  if (!parsed.success) {
    throw new MarketingError("INVALID_STATUS", "حالة الحملة غير صالحة.");
  }
  if (!isMarketingConfigured()) {
    throw new MarketingError(
      "STORE_UNAVAILABLE",
      "بيانات الحملات غير مُفعّلة على هذا النشر بعد.",
      503,
    );
  }

  const current = (await listCampaignRows()).find(
    (campaign) => campaign.id === campaignId,
  );
  if (!current) {
    throw new MarketingError("CAMPAIGN_NOT_FOUND", "الحملة غير موجودة.", 404);
  }
  if (current.status === "closed") {
    throw new MarketingError(
      "CAMPAIGN_CLOSED",
      "الحملة منتهية ولا يمكن تغيير حالتها.",
      409,
    );
  }

  const updated = await updateCampaignStatusRow(
    campaignId,
    parsed.data.status,
  );
  if (!updated) {
    throw new MarketingError("CAMPAIGN_NOT_FOUND", "الحملة غير موجودة.", 404);
  }
  return updated;
}

export async function recordMarketingEntry(
  input: MarketingEntryInput,
  recordedBy: string,
): Promise<MarketingEntry> {
  const parsed = MARKETING_ENTRY_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new MarketingError(
      "INVALID_ENTRY",
      parsed.error.errors[0]?.message ??
        "بيانات الإدخال التسويقي غير مكتملة أو غير صالحة.",
    );
  }
  if (!isMarketingConfigured()) {
    throw new MarketingError(
      "STORE_UNAVAILABLE",
      "بيانات الحملات غير مُفعّلة على هذا النشر بعد.",
      503,
    );
  }

  const campaign = (await listCampaignRows()).find(
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

  return insertMarketingEntryRow(campaign, parsed.data, recordedBy);
}

/**
 * Updates a platform's integration settings.
 *
 * Switching sync on runs the credential verifier over the merged credential set
 * — the sealed values already on the row plus whatever the operator supplied —
 * so re-saving an already-connected platform does not demand the secret again.
 * A rejected key never reaches a stored row.
 */
export async function updatePlatformSettings(
  input: PlatformSettingsInput,
  updatedBy: string | null,
): Promise<PlatformSettings> {
  const parsed = PLATFORM_SETTINGS_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new MarketingError(
      "INVALID_SETTINGS",
      "بيانات إعدادات المنصة غير صالحة.",
    );
  }
  if (!isMarketingConfigured()) {
    throw new MarketingError(
      "STORE_UNAVAILABLE",
      "إعدادات المنصات غير مُفعّلة على هذا النشر بعد.",
      503,
    );
  }

  const previous = await readPlatformCredentials(parsed.data.platform);
  const merged = { ...previous };
  for (const [key, value] of Object.entries(parsed.data.credentials)) {
    const trimmed = value.trim();
    if (trimmed !== "") merged[key] = trimmed;
  }

  if (parsed.data.enabled) {
    const verification = verifyPlatformCredentials(
      parsed.data.platform,
      merged,
    );
    if (!verification.ok) {
      throw new MarketingError("CREDENTIALS_UNVERIFIED", verification.error, 422);
    }
  }

  return upsertPlatformSettingsRow(parsed.data, merged, updatedBy);
}
