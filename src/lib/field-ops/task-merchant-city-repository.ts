import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * City attribution for merchants that have no `app.merchants` row.
 *
 * A handful of V1 catalogue merchants exist only in visit history. Scheduled
 * visits and their follow-ups carry the city they were assigned to, which is the
 * only place such a merchant's city exists. The newest task wins, so a merchant
 * moved between cities reports its current one.
 *
 * Lives in its own module so the task repository stays a thin I/O shell for the
 * board itself.
 */
export async function listTaskMerchantCities(
  merchantIds: readonly string[],
): Promise<Map<string, string>> {
  const cities = new Map<string, string>();
  if (!hasSupabaseConfig() || merchantIds.length === 0) return cities;

  const client = getSupabaseServerClient();
  const [tasks, followUps] = await Promise.all([
    client
      .schema("app")
      .from("field_tasks")
      .select("merchant_id,city_id,created_at")
      .in("merchant_id", [...merchantIds])
      .order("created_at", { ascending: false }),
    client
      .schema("app")
      .from("follow_up_tasks")
      .select("merchant_id,city_id,created_at")
      .in("merchant_id", [...merchantIds])
      .order("created_at", { ascending: false }),
  ]);

  for (const result of [tasks, followUps]) {
    if (result.error) {
      if (isMissingSchemaObject(result.error)) continue;
      throw result.error;
    }
    for (const row of (result.data ?? []) as Array<{
      merchant_id: string;
      city_id: string | null;
    }>) {
      if (row.city_id && !cities.has(row.merchant_id)) {
        cities.set(row.merchant_id, row.city_id);
      }
    }
  }
  return cities;
}
