import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Tier 4 repository for the live-month KPI rank rollup.
 *
 * `app.agent_kpi_rank_rollup` scores every rep once in SQL and ranks them
 * within their primary city scope. The service used to recompute a rep's facts
 * for every peer in the city on every snapshot (O(agents² × city)); reading this
 * view turns ranking into one indexed round trip.
 *
 * Returns `null` when Supabase is not configured, the view is not deployed, or
 * the requested month is not the live month (history comes from
 * `app.kpi_snapshots`). The service then ranks the pre-computed facts locally.
 */

export type KpiRankFact = {
  cityId: string;
  score: number;
  position: number;
  total: number;
};

type RankRow = {
  rep_id: string;
  city_id: string | null;
  score: number | string | null;
  position: number | string | null;
  total: number | string | null;
};

export function isKpiRankRollupConfigured(): boolean {
  return hasSupabaseConfig();
}

export async function loadAgentKpiRanks(): Promise<Map<
  string,
  KpiRankFact
> | null> {
  if (!isKpiRankRollupConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("agent_kpi_rank_rollup")
    .select("rep_id,city_id,score,position,total");

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }

  const ranks = new Map<string, KpiRankFact>();
  for (const row of (data ?? []) as RankRow[]) {
    if (!row.city_id) continue;
    ranks.set(row.rep_id, {
      cityId: row.city_id,
      score: Number(row.score ?? 0),
      position: Number(row.position ?? 0),
      total: Number(row.total ?? 0),
    });
  }
  return ranks;
}
