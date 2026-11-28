import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { refreshVariantsFromDatabase } from "@/lib/taxonomy/db-variants";
import {
  toTaxonomyCategories,
  toTaxonomyVendorType,
  type CategoryDbRow,
  type VendorTypeDbRow,
} from "@/lib/taxonomy/db-mapping";
import {
  listCategories,
  listVariants,
  listVendorTypes,
  taxonomySnapshot,
} from "@/lib/taxonomy/catalog";
import { taxonomyRevision, type TaxonomySnapshot } from "@/lib/taxonomy/store";

const VENDOR_COLUMNS = "id,name_ar,name_en,created_at,updated_at";
const CATEGORY_COLUMNS =
  "id,parent_id,vendor_type,vendor_type_id,numeric_id,name_ar,name_en,level,source";

/**
 * Reads the taxonomy portfolio from the tables the V1 sync writes to.
 *
 * Variants still hydrate into the shared in-memory store because approval
 * requests mutate them there. Vendors and categories come straight from the
 * synced tables so a fresh upload is visible on the next request, without a
 * redeploy or an in-memory seed fallback hiding the new rows. A deployment that
 * runs ahead of the migration keeps the generated seed snapshot.
 */
export async function loadTaxonomySnapshotFromDatabase(): Promise<TaxonomySnapshot> {
  await refreshVariantsFromDatabase();
  if (!hasSupabaseConfig()) return taxonomySnapshot();

  const client = getSupabaseServerClient();
  const [vendors, categories, revision] = await Promise.all([
    client
      .schema("app")
      .from("vendor_types")
      .select(VENDOR_COLUMNS)
      .order("id", { ascending: true }),
    client
      .schema("app")
      .from("taxonomy_categories")
      .select(CATEGORY_COLUMNS)
      .eq("source", "v1")
      .order("vendor_type_id", { ascending: true })
      .order("numeric_id", { ascending: true }),
    loadTaxonomyRevisionFromDatabase(),
  ]);

  const missingSchema =
    isMissingSchemaObject(vendors.error) ||
    isMissingSchemaObject(categories.error);
  if (missingSchema) {
    console.warn(
      "[taxonomy] synced tables are not exposed yet; using the generated seed snapshot.",
    );
    return taxonomySnapshot();
  }

  if (vendors.error || categories.error) {
    console.error("[taxonomy] failed to load the synced taxonomy snapshot.", {
      vendors: vendors.error,
      categories: categories.error,
    });
  }

  const vendorRows = (vendors.data ?? []) as unknown as VendorTypeDbRow[];
  const categoryRows = (categories.data ?? []) as unknown as CategoryDbRow[];
  const vendorTypes =
    vendorRows.length > 0
      ? vendorRows.map(toTaxonomyVendorType)
      : listVendorTypes();
  const mappedCategories =
    categoryRows.length > 0
      ? toTaxonomyCategories(categoryRows)
      : listCategories();

  return {
    vendorTypes,
    categories: mappedCategories,
    variants: listVariants(),
    revision: Math.max(revision, taxonomyRevision()),
  };
}

export async function loadTaxonomyRevisionFromDatabase(): Promise<number> {
  if (!hasSupabaseConfig()) return taxonomyRevision();

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("taxonomy_state")
    .select("revision")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (!isMissingSchemaObject(error)) {
      console.error("[taxonomy] failed to read the taxonomy revision.", error);
    }
    return taxonomyRevision();
  }
  if (!data) return taxonomyRevision();
  return Math.max(Number((data as { revision?: number }).revision ?? 1), 1);
}
