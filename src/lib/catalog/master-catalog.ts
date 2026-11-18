import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  prepareMasterCatalogItem,
  searchMasterCatalog,
  type MasterCatalogItem,
  type PreparedMasterCatalogItem,
} from "./master-catalog-search";

/**
 * Tier 4 repository for `app.master_catalog_products`.
 *
 * The catalog is read-only reference data (3,244 V1 rows). It is small enough
 * to load in one pass and rank in memory, which keeps the Arabic fuzzy matcher
 * identical to the unit-tested pure function. Edge isolates reuse the snapshot
 * for five minutes, so the database is not queried per keystroke.
 */

const PAGE_SIZE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

type MasterCatalogRow = {
  id: string;
  name: string;
  category_label: string;
  category_key: string | null;
  price_minor: number | string;
  image_url: string;
  drive_file_id: string;
};

let cache: { items: PreparedMasterCatalogItem[]; expiresAt: number } | null =
  null;

function toItem(row: MasterCatalogRow): MasterCatalogItem {
  return {
    id: row.id,
    name: row.name,
    categoryLabel: row.category_label ?? "",
    categoryKey: row.category_key ?? null,
    price: Number(row.price_minor) / 100,
    imageUrl: row.image_url ?? "",
    driveFileId: row.drive_file_id ?? "",
  };
}

async function loadMasterCatalog(): Promise<PreparedMasterCatalogItem[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.items;
  if (!hasSupabaseConfig()) return [];

  const client = getSupabaseServerClient();
  const rows: MasterCatalogRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .schema("app")
      .from("master_catalog_products")
      .select(
        "id,name,category_label,category_key,price_minor,image_url,drive_file_id",
      )
      .eq("active", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as MasterCatalogRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const items = rows.map((row) => prepareMasterCatalogItem(toItem(row)));
  cache = { items, expiresAt: Date.now() + CACHE_TTL_MS };
  return items;
}

export async function searchMasterCatalogProducts(
  query: string,
  limit = 20,
): Promise<MasterCatalogItem[]> {
  const items = await loadMasterCatalog();
  return searchMasterCatalog(items, query, limit);
}
