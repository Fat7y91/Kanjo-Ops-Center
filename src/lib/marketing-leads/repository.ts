import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isQueryTimeout,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { GovernanceError, fromDatabaseError } from "@/lib/governance/errors";

import {
  isLeadStatus,
  type LeadSource,
  type LeadStatus,
  type MarketingLead,
} from "./types";

/**
 * Tier 4 repository for `app.marketing_leads`.
 *
 * The lead joins its campaign for its display name. A lead whose campaign was
 * deleted keeps a null campaign and still renders. Reads degrade to `null` when
 * the migration is not deployed; writes keep strict errors.
 */

const READ_TIMEOUT_MS = 6_000;
const LIST_LIMIT = 300;

const COLUMNS =
  "id,campaign_id,city_id,phone_number,promo_code,user_guess,prize_details,source,status,notes,occurred_at,created_at,marketing_campaigns(name)";

type LeadRow = {
  id: string;
  campaign_id: string | null;
  city_id: string | null;
  phone_number: string;
  promo_code: string;
  user_guess: string;
  prize_details: string;
  source: LeadSource;
  status: string;
  notes: string;
  occurred_at: string;
  created_at: string;
  marketing_campaigns: { name: string } | { name: string }[] | null;
};

export function isMarketingLeadsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function embedCampaignName(
  embed: LeadRow["marketing_campaigns"],
): string | null {
  if (!embed) return null;
  if (Array.isArray(embed)) return embed[0]?.name ?? null;
  return embed.name ?? null;
}

function toLead(row: LeadRow): MarketingLead {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignName: embedCampaignName(row.marketing_campaigns),
    cityId: row.city_id,
    phoneNumber: row.phone_number,
    promoCode: row.promo_code,
    userGuess: row.user_guess,
    prizeDetails: row.prize_details,
    source: row.source,
    status: isLeadStatus(row.status) ? row.status : "new",
    notes: row.notes,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export async function listMarketingLeads(
  limit: number = LIST_LIMIT,
): Promise<MarketingLead[] | null> {
  if (!isMarketingLeadsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_leads")
    .select(COLUMNS)
    .order("occurred_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, LIST_LIMIT)))
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    if (isQueryTimeout(error)) {
      throw new Error(
        "MARKETING_LEADS_TIMEOUT: the lead queue read exceeded its deadline",
      );
    }
    throw error;
  }

  return ((data ?? []) as LeadRow[]).map(toLead);
}

export async function insertMarketingLead(row: {
  campaignId: string | null;
  cityId: string | null;
  phoneNumber: string;
  promoCode: string;
  userGuess: string;
  prizeDetails: string;
  source: LeadSource;
  occurredAt?: string;
}): Promise<MarketingLead> {
  const client = getSupabaseServerClient();
  const insert: Record<string, unknown> = {
    campaign_id: row.campaignId,
    city_id: row.cityId,
    phone_number: row.phoneNumber,
    promo_code: row.promoCode,
    user_guess: row.userGuess,
    prize_details: row.prizeDetails,
    source: row.source,
  };
  if (row.occurredAt) insert.occurred_at = row.occurredAt;

  const { data, error } = await client
    .schema("app")
    .from("marketing_leads")
    .insert(insert)
    .select(COLUMNS)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new GovernanceError(
        "STORE_UNAVAILABLE",
        "سجل عملاء الحملات غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
  return toLead(data as LeadRow);
}

export async function updateMarketingLead(
  id: string,
  patch: {
    status?: LeadStatus;
    notes?: string;
    campaignId?: string | null;
  },
): Promise<MarketingLead> {
  const client = getSupabaseServerClient();
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.campaignId !== undefined) update.campaign_id = patch.campaignId;

  const { data, error } = await client
    .schema("app")
    .from("marketing_leads")
    .update(update)
    .eq("id", id)
    .select(COLUMNS)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new GovernanceError(
        "STORE_UNAVAILABLE",
        "سجل عملاء الحملات غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
  return toLead(data as LeadRow);
}
