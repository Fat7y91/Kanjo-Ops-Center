import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Tier 4 repository for the overview's per-merchant facts.
 *
 * `app.bi_merchant_rollup` pre-computes, in SQL, the newest visit, the newest
 * negotiated commission and the published-product count for each merchant.
 * The overview used to derive all three in the Worker by downloading the whole
 * `app.visit_reports` table and joining products to merchants with a nested
 * `find` (O(products × merchants)) — one of the P0 Edge CPU 1102 offenders.
 *
 * Returns `null` when Supabase is not configured or the view is not deployed;
 * `dataset.ts` then derives the same facts with a single pass over the live
 * visit reports.
 */

export type BiMerchantFact = {
  visitedAt: string | null;
  repId: string | null;
  repName: string | null;
  negotiatedCommission: number | null;
};

type MerchantFactRow = {
  id: string;
  visited_at: string | null;
  rep_id: string | null;
  rep_name: string | null;
  negotiated_commission: number | string | null;
};

export function isBiRollupConfigured(): boolean {
  return hasSupabaseConfig();
}

export async function loadBiMerchantFacts(): Promise<
  Map<string, BiMerchantFact> | null
> {
  if (!isBiRollupConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("bi_merchant_rollup")
    .select(
      "id,visited_at,rep_id,rep_name,negotiated_commission",
    );

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }

  const facts = new Map<string, BiMerchantFact>();
  for (const row of (data ?? []) as MerchantFactRow[]) {
    facts.set(row.id, {
      visitedAt: row.visited_at,
      repId: row.rep_id,
      repName: row.rep_name,
      negotiatedCommission:
        row.negotiated_commission == null
          ? null
          : Number(row.negotiated_commission),
    });
  }
  return facts;
}
