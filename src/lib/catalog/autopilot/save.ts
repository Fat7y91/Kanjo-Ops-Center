import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { normalizeSearchText } from "@/lib/search/normalize";
import { generateSku } from "@/lib/catalog/sku";
import { getVendorType } from "@/lib/taxonomy/store";

import {
  defaultSupermarketCategoryKey,
  supermarketCategories,
} from "./categories";
import type {
  AutopilotSaveItem,
  AutopilotSaveResult,
} from "./types";

type ExistingRow = {
  id: string;
  barcode: string | null;
  normalized_name: string;
  image_data_url: string | null;
  taxonomy_category_id: string | null;
  qa_metadata: Record<string, unknown> | null;
};

const WRITE_TIMEOUT_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let categoryCache: { map: Map<string, string>; expiresAt: number } | null = null;

/**
 * The merchant product screen stores the category key, while the database also
 * has a UUID taxonomy reference. Resolve the UUIDs by name so both columns stay
 * consistent without hardcoding deployment-specific ids.
 */
async function categoryUuidMap(): Promise<Map<string, string>> {
  if (categoryCache && categoryCache.expiresAt > Date.now()) {
    return categoryCache.map;
  }
  const map = new Map<string, string>();
  if (!hasSupabaseConfig()) return map;

  const vendorName = getVendorType(4)?.name_ar ?? "سوبر ماركت";
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("taxonomy_categories")
    .select("id,name_ar,name_en")
    .eq("vendor_type", vendorName);

  if (!error && Array.isArray(data)) {
    const rows = data as { id: string; name_ar: string; name_en: string }[];
    for (const category of supermarketCategories()) {
      const names = new Set(
        [category.name_ar, category.name_en]
          .map((name) => normalizeSearchText(name))
          .filter(Boolean),
      );
      const match = rows.find(
        (row) =>
          names.has(normalizeSearchText(row.name_ar)) ||
          (row.name_en && names.has(normalizeSearchText(row.name_en))),
      );
      if (match) map.set(category.key, match.id);
    }
  } else if (error && !isMissingSchemaObject(error)) {
    console.error("[autopilot] taxonomy category lookup failed", error);
  }

  categoryCache = { map, expiresAt: Date.now() + 10 * 60 * 1000 };
  return map;
}

function mergeQa(row: ExistingRow, item: AutopilotSaveItem, now: string) {
  const base =
    row.qa_metadata && typeof row.qa_metadata === "object" && !Array.isArray(row.qa_metadata)
      ? row.qa_metadata
      : {};
  return {
    ...base,
    autopilot_source: item.imageSource,
    autopilot_unit: item.unit,
    autopilot_master_catalog_id: item.masterCatalogId,
    autopilot_image_url: item.imageUrlRaw ?? null,
    autopilot_imported_at: now,
  };
}

function newQa(item: AutopilotSaveItem, now: string) {
  return {
    autopilot_source: item.imageSource,
    autopilot_unit: item.unit,
    autopilot_master_catalog_id: item.masterCatalogId,
    autopilot_image_url: item.imageUrlRaw ?? null,
    autopilot_imported_at: now,
  };
}

async function existingRows(
  merchantId: string,
  barcodes: string[],
  names: string[],
): Promise<ExistingRow[]> {
  const client = getSupabaseServerClient();
  const columns =
    "id,barcode,normalized_name,image_data_url,taxonomy_category_id,qa_metadata";
  const rows: ExistingRow[] = [];

  if (barcodes.length > 0) {
    const { data, error } = await client
      .schema("app")
      .from("catalog_products")
      .select(columns)
      .eq("merchant_id", merchantId)
      .in("barcode", barcodes)
      .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
    if (error && !isMissingSchemaObject(error)) throw error;
    rows.push(...((data ?? []) as ExistingRow[]));
  }

  if (names.length > 0) {
    const { data, error } = await client
      .schema("app")
      .from("catalog_products")
      .select(columns)
      .eq("merchant_id", merchantId)
      .in("normalized_name", names)
      .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
    if (error && !isMissingSchemaObject(error)) throw error;
    rows.push(...((data ?? []) as ExistingRow[]));
  }

  return rows;
}

/**
 * Merchant-scoped upsert for autopilot batches. Barcode is the identity when
 * present; otherwise the normalized name prevents a re-upload from duplicating
 * the whole sheet. Only price/image/category/QA provenance are written.
 */
export async function saveAutopilotItems(
  merchantId: string,
  items: AutopilotSaveItem[],
  actor: { id: string; name: string } | null,
): Promise<AutopilotSaveResult> {
  if (!hasSupabaseConfig()) {
    throw new Error("قاعدة بيانات الكتالوج غير متصلة.");
  }

  const categories = new Set(supermarketCategories().map((c) => c.key));
  const fallback = defaultSupermarketCategoryKey();
  const categoryIds = await categoryUuidMap();
  const client = getSupabaseServerClient();
  const now = new Date().toISOString();

  const barcodes = [...new Set(items.map((item) => item.barcode).filter(Boolean))];
  const names = [
    ...new Set(items.map((item) => normalizeSearchText(item.name)).filter(Boolean)),
  ];
  const rows = await existingRows(merchantId, barcodes, names);
  const byBarcode = new Map<string, ExistingRow>();
  const byName = new Map<string, ExistingRow>();
  for (const row of rows) {
    if (row.barcode) byBarcode.set(row.barcode, row);
    if (row.normalized_name) byName.set(row.normalized_name, row);
  }

  let inserted = 0;
  let updated = 0;
  const failures: { name: string; message: string }[] = [];

  for (const item of items) {
    const categoryKey = categories.has(item.categoryKey)
      ? item.categoryKey
      : fallback;
    const normalized = normalizeSearchText(item.name);
    const existing =
      (item.barcode ? byBarcode.get(item.barcode) : undefined) ??
      byName.get(normalized);

    try {
      if (existing) {
        const patch: Record<string, unknown> = {
          price_minor: item.priceMinor,
          category_key: categoryKey,
          vendor_type_id: 4,
          updated_at: now,
          qa_metadata: mergeQa(existing, item, now),
        };
        const categoryId = categoryIds.get(categoryKey);
        if (categoryId) patch.taxonomy_category_id = categoryId;
        if (item.imageDataUrl) patch.image_data_url = item.imageDataUrl;

        const { error } = await client
          .schema("app")
          .from("catalog_products")
          .update(patch)
          .eq("id", existing.id)
          .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
        if (error) throw error;
        updated += 1;
        existing.qa_metadata = patch.qa_metadata as Record<string, unknown>;
        if (item.imageDataUrl) existing.image_data_url = item.imageDataUrl;
        existing.normalized_name = normalized;
        if (existing.barcode) byBarcode.set(existing.barcode, existing);
        byName.set(normalized, existing);
        continue;
      }

      const id = `p-${crypto.randomUUID().slice(0, 8)}`;
      const { error } = await client
        .schema("app")
        .from("catalog_products")
        .insert({
          id,
          merchant_id: merchantId,
          name: item.name,
          normalized_name: normalized,
          description: "",
          vendor_type_id: 4,
          category_key: categoryKey,
          taxonomy_category_id: categoryIds.get(categoryKey) ?? null,
          product_type: "simple",
          sku: item.barcode || generateSku(4),
          barcode: item.barcode || null,
          image_data_url: item.imageDataUrl,
          attributes: [],
          price_minor: item.priceMinor,
          state: "completed",
          review_note: "استيراد تلقائي",
          entered_by_name: actor?.name ?? null,
          client_product_id: null,
          qa_metadata: newQa(item, now),
          created_by: actor && UUID.test(actor.id) ? actor.id : null,
          created_at: now,
          updated_at: now,
        })
        .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
      if (error) throw error;

      inserted += 1;
      const row: ExistingRow = {
        id,
        barcode: item.barcode || null,
        normalized_name: normalized,
        image_data_url: item.imageDataUrl,
        taxonomy_category_id: categoryIds.get(categoryKey) ?? null,
        qa_metadata: newQa(item, now),
      };
      if (row.barcode) byBarcode.set(row.barcode, row);
      byName.set(normalized, row);
    } catch (error) {
      failures.push({
        name: item.name,
        message:
          error instanceof Error && error.message
            ? error.message
            : "تعذر حفظ المنتج.",
      });
    }
  }

  return { inserted, updated, failed: failures.length, failures: failures.slice(0, 25) };
}
