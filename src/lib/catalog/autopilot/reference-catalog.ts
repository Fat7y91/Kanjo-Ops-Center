import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { extractPharmacyAttributes } from "./pharmacy-attributes";
import type { ReferenceProduct } from "./pharmacy-match";

/**
 * Read model for the curated pharmacy reference merchant.
 *
 * The reference is a real merchant catalog (not `master_catalog_products`), so
 * it inherits its messy names and external image URLs. Rows are loaded once per
 * isolate and reused for five minutes; attributes are precomputed here so a
 * batch of POS items does not re-parse the same 1,900 names.
 */

const PAGE_SIZE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

type ReferenceRow = {
  id: string;
  name: string;
  description: string | null;
  barcode: string | null;
  image_data_url: string | null;
  category_key: string | null;
};

const cache = new Map<
  string,
  { items: ReferenceProduct[]; expiresAt: number }
>();

/** Default reference merchant (د. جيهان عزت) unless configured otherwise. */
export function pharmacyReferenceMerchantId(): string {
  return (
    process.env.PHARMACY_REFERENCE_MERCHANT_ID?.trim() || "KJ-2579AN"
  );
}

function toProduct(row: ReferenceRow): ReferenceProduct {
  return {
    id: row.id,
    name: row.name ?? "",
    description: row.description ?? "",
    barcode: row.barcode ?? "",
    categoryKey: row.category_key ?? null,
    imageUrl: row.image_data_url ?? null,
    attributes: extractPharmacyAttributes(row.name ?? ""),
  };
}

export async function loadReferenceProducts(
  merchantId: string,
): Promise<ReferenceProduct[]> {
  const cached = cache.get(merchantId);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  if (!hasSupabaseConfig()) return [];

  const client = getSupabaseServerClient();
  const items: ReferenceProduct[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .schema("app")
      .from("catalog_products")
      .select("id,name,description,barcode,image_data_url,category_key")
      .eq("merchant_id", merchantId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (!isMissingSchemaObject(error)) {
        console.error("[autopilot] reference catalog lookup failed", error);
      }
      return items;
    }

    const page = (data ?? []) as ReferenceRow[];
    items.push(...page.map(toProduct));
    if (page.length < PAGE_SIZE) break;
  }

  cache.set(merchantId, {
    items,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return items;
}

export function loadDefaultReferenceProducts(): Promise<ReferenceProduct[]> {
  return loadReferenceProducts(pharmacyReferenceMerchantId());
}
