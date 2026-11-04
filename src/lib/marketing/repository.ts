import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { actorIdOrNull } from "@/lib/db/actor-id";

import { openCredentials, sealCredentials } from "./secret-box";
import type {
  CampaignInput,
  MarketingCampaign,
  MarketingEntry,
  MarketingEntryInput,
  PlatformSettings,
  PlatformSettingsInput,
} from "./types";

/**
 * Tier 4 repository for the marketing tables
 * (`20261030000300_marketing.sql`, `20261030000600_marketing_campaigns.sql`).
 *
 * Campaigns are plans, entries are append-only daily facts whose platform and
 * channel the SQL guard trigger copies down from the campaign. Credentials are
 * sealed in `api_key_ciphertext` through `secret-box.ts` and are only ever read
 * back on the server to verify a connection.
 *
 * There is no seed: a deployment without these tables reads empty and refuses
 * writes rather than acknowledging a phantom campaign.
 */

const CAMPAIGN_COLUMNS =
  "id,name,platform,channel,city_id,budget_minor,target_leads,target_conversions,starts_on,ends_on,status,created_by,created_at,closed_at";

const ENTRY_COLUMNS =
  "id,campaign_id,spend_minor,impressions,clicks,leads,conversions,occurred_at,note,recorded_by,recorded_at";

const SETTINGS_COLUMNS =
  "platform,enabled,webhook_url,updated_at,api_key_ciphertext";

type CampaignRow = {
  id: string;
  name: string;
  platform: MarketingCampaign["platform"];
  channel: MarketingCampaign["channel"];
  city_id: string | null;
  budget_minor: number | string;
  target_leads: number | string;
  target_conversions: number | string;
  starts_on: string;
  ends_on: string;
  status: MarketingCampaign["status"];
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
};

type EntryRow = {
  id: string;
  campaign_id: string;
  spend_minor: number | string;
  impressions: number | string;
  clicks: number | string;
  leads: number | string;
  conversions: number | string;
  occurred_at: string;
  note: string;
  recorded_by: string | null;
  recorded_at: string;
};

type SettingsRow = {
  platform: PlatformSettings["platform"];
  enabled: boolean;
  webhook_url: string;
  updated_at: string;
  api_key_ciphertext: string | null;
};

export function isMarketingDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function toCampaign(row: CampaignRow): MarketingCampaign {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    channel: row.channel,
    cityId: row.city_id,
    budget: Number(row.budget_minor) / 100,
    targetLeads: Number(row.target_leads),
    targetConversions: Number(row.target_conversions),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    status: row.status,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function toEntry(row: EntryRow): MarketingEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    spend: Number(row.spend_minor) / 100,
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    leads: Number(row.leads),
    conversions: Number(row.conversions),
    occurredAt: row.occurred_at,
    note: row.note,
    recordedBy: row.recorded_by ?? "",
    recordedAt: row.recorded_at,
  };
}

export async function listCampaignRows(): Promise<MarketingCampaign[]> {
  if (!isMarketingDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as CampaignRow[]).map(toCampaign);
}

export async function listMarketingEntryRows(
  campaignId?: string,
): Promise<MarketingEntry[]> {
  if (!isMarketingDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const base = client
    .schema("app")
    .from("marketing_entries")
    .select(ENTRY_COLUMNS)
    .not("campaign_id", "is", null)
    .order("occurred_at", { ascending: true });

  const { data, error } = campaignId
    ? await base.eq("campaign_id", campaignId)
    : await base;

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as EntryRow[]).map(toEntry);
}

export async function insertCampaignRow(
  input: CampaignInput,
  createdBy: string | null,
): Promise<MarketingCampaign> {
  if (!isMarketingDatabaseConfigured()) {
    throw new Error("MARKETING_STORE_UNAVAILABLE");
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_campaigns")
    .insert({
      name: input.name,
      platform: input.platform,
      channel: input.channel,
      city_id: input.cityId,
      budget_minor: Math.round(input.budget * 100),
      target_leads: input.targetLeads,
      target_conversions: input.targetConversions,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: "active",
      created_by: actorIdOrNull(createdBy),
    })
    .select(CAMPAIGN_COLUMNS)
    .single();

  if (error) throw error;
  return toCampaign(data as unknown as CampaignRow);
}

export async function updateCampaignStatusRow(
  campaignId: string,
  status: MarketingCampaign["status"],
): Promise<MarketingCampaign | null> {
  if (!isMarketingDatabaseConfigured()) {
    throw new Error("MARKETING_STORE_UNAVAILABLE");
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_campaigns")
    .update({
      status,
      closed_at: status === "closed" ? new Date().toISOString() : null,
    })
    .eq("id", campaignId)
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? toCampaign(data as unknown as CampaignRow) : null;
}

export async function insertMarketingEntryRow(
  campaign: MarketingCampaign,
  input: MarketingEntryInput,
  recordedBy: string | null,
): Promise<MarketingEntry> {
  if (!isMarketingDatabaseConfigured()) {
    throw new Error("MARKETING_STORE_UNAVAILABLE");
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_entries")
    .insert({
      campaign_id: campaign.id,
      // The guard trigger re-derives both from the campaign; supplying them
      // keeps the insert valid for a deployment that has not applied it yet.
      platform: campaign.platform,
      channel: campaign.channel,
      campaign: campaign.name,
      city_id: campaign.cityId,
      spend_minor: Math.round(input.spend * 100),
      impressions: input.impressions,
      clicks: input.clicks,
      leads: input.leads,
      conversions: input.conversions,
      occurred_at: input.occurredAt,
      note: input.note ?? "",
      recorded_by: actorIdOrNull(recordedBy),
    })
    .select(ENTRY_COLUMNS)
    .single();

  if (error) throw error;
  return toEntry(data as unknown as EntryRow);
}

export async function listPlatformSettingsRows(): Promise<PlatformSettings[]> {
  if (!isMarketingDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_platform_settings")
    .select(SETTINGS_COLUMNS)
    .order("platform", { ascending: true });

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as SettingsRow[]).map((row) => ({
    platform: row.platform,
    enabled: row.enabled,
    apiKeyConfigured: Boolean(row.api_key_ciphertext),
    webhookUrl: row.webhook_url,
    updatedAt: row.updated_at,
  }));
}

/**
 * Reads the sealed credential set for one platform so the verifier can judge the
 * *merged* values (stored ones plus the fields supplied now).
 */
export async function readPlatformCredentials(
  platform: PlatformSettings["platform"],
): Promise<Record<string, string>> {
  if (!isMarketingDatabaseConfigured()) return {};

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_platform_settings")
    .select("api_key_ciphertext")
    .eq("platform", platform)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return {};
    throw error;
  }
  return openCredentials(
    (data as { api_key_ciphertext: string | null } | null)?.api_key_ciphertext ??
      null,
  );
}

export async function upsertPlatformSettingsRow(
  input: PlatformSettingsInput,
  credentials: Readonly<Record<string, string>>,
  updatedBy: string | null,
): Promise<PlatformSettings> {
  if (!isMarketingDatabaseConfigured()) {
    throw new Error("MARKETING_STORE_UNAVAILABLE");
  }

  const client = getSupabaseServerClient();
  const configured = Object.keys(credentials).length > 0;
  const { data, error } = await client
    .schema("app")
    .from("marketing_platform_settings")
    .upsert(
      {
        platform: input.platform,
        enabled: input.enabled,
        api_key_ciphertext: configured
          ? await sealCredentials(credentials)
          : null,
        webhook_url: input.webhookUrl,
        updated_at: new Date().toISOString(),
        updated_by: actorIdOrNull(updatedBy),
      },
      { onConflict: "platform" },
    )
    .select(SETTINGS_COLUMNS)
    .single();

  if (error) throw error;
  const row = data as unknown as SettingsRow;
  return {
    platform: row.platform,
    enabled: row.enabled,
    apiKeyConfigured: Boolean(row.api_key_ciphertext),
    webhookUrl: row.webhook_url,
    updatedAt: row.updated_at,
  };
}
