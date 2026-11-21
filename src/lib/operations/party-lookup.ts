import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Read-time name resolution for ledger parties.
 *
 * A party ledger account stores a snapshot label (`"merchant KJ-…"`) when it is
 * created. That snapshot drifts the moment a merchant or courier is renamed, and
 * it leaks the raw identifier into the UI. The ledger book therefore resolves
 * the current human name at read time from the source roster instead of trusting
 * the account label.
 *
 * Names are cosmetic: a lookup failure degrades to the caller's fallback label
 * rather than blanking a balance screen.
 */

export type PartyNames = {
  merchants: Map<string, string>;
  couriers: Map<string, string>;
};

const EMPTY: PartyNames = {
  merchants: new Map(),
  couriers: new Map(),
};

async function namesById(
  table: "merchants" | "couriers",
  column: "name" | "display_name",
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id) => id !== ""))];
  if (unique.length === 0) return new Map();

  try {
    const client = getSupabaseServerClient();
    const { data, error } = await client
      .schema("app")
      .from(table)
      .select(`id,${column}`)
      .in("id", unique)
      .limit(unique.length);

    if (error) throw error;

    const map = new Map<string, string>();
    for (const row of (data ?? []) as Record<string, string>[]) {
      const name = row[column]?.trim();
      if (name) map.set(row.id, name);
    }
    return map;
  } catch (error) {
    if (isMissingSchemaObject(error)) return new Map();
    // A roster read must not take the money screen down. The caller falls back
    // to a neutral label, and the stale account label is never the raw id.
    return new Map();
  }
}

export async function resolvePartyNames(parties: {
  merchantIds: string[];
  courierIds: string[];
}): Promise<PartyNames> {
  if (parties.merchantIds.length === 0 && parties.courierIds.length === 0) {
    return EMPTY;
  }

  const [merchants, couriers] = await Promise.all([
    namesById("merchants", "name", parties.merchantIds),
    namesById("couriers", "display_name", parties.courierIds),
  ]);

  return { merchants, couriers };
}
