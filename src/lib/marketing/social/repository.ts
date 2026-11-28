import "server-only";

import { actorIdOrNull } from "@/lib/db/actor-id";
import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { SocialAccount, SocialMetricRow } from "./types";

const COLUMNS =
  "id,platform,account_id,account_name,followers,likes,captured_at";

type MetricRow = {
  id: string;
  platform: SocialMetricRow["platform"];
  account_id: string;
  account_name: string;
  followers: number | string;
  likes: number | string;
  captured_at: string;
};

export function isSocialMetricsConfigured(): boolean {
  return hasSupabaseConfig();
}

function toMetric(row: MetricRow): SocialMetricRow {
  return {
    id: row.id,
    platform: row.platform,
    accountId: row.account_id,
    accountName: row.account_name,
    followers: Number(row.followers),
    likes: Number(row.likes),
    capturedAt: row.captured_at,
  };
}

export async function listSocialMetricRowsSince(
  since: Date,
): Promise<SocialMetricRow[]> {
  if (!isSocialMetricsConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_social_metrics")
    .select(COLUMNS)
    .gte("captured_at", since.toISOString())
    .order("captured_at", { ascending: true })
    .limit(5000);

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as MetricRow[]).map(toMetric);
}

export async function latestSocialCapturedAt(): Promise<string | null> {
  if (!isSocialMetricsConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_social_metrics")
    .select("captured_at")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return (data as { captured_at: string } | null)?.captured_at ?? null;
}

export async function insertSocialMetricRows(
  accounts: readonly SocialAccount[],
  capturedBy: string | null,
): Promise<number> {
  if (!isSocialMetricsConfigured() || accounts.length === 0) return 0;

  const capturedAt = new Date().toISOString();
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("marketing_social_metrics")
    .insert(
      accounts.map((account) => ({
        platform: account.platform,
        account_id: account.accountId,
        account_name: account.accountName,
        followers: Math.max(0, Math.round(account.followers)),
        likes: Math.max(0, Math.round(account.likes)),
        captured_at: capturedAt,
        captured_by: actorIdOrNull(capturedBy),
      })),
    )
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}
