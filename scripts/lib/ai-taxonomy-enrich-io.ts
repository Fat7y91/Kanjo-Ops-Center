import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { VENDOR_TYPE_SEED } from "../../src/lib/taxonomy/data.generated";

import { callDeepSeek, withRetry } from "./ai-taxonomy-io";
import {
  buildUserPrompt as buildMerchantPrompt,
  coerceMerchantClassifications,
  extractJsonArray,
  SYSTEM_PROMPT as MERCHANT_PROMPT,
  type MerchantClassification,
  type MerchantRow,
} from "./ai-taxonomy-merchants";
import {
  applyVariantMappings,
  buildUserPrompt as buildVariantPrompt,
  coerceVariantClassifications,
  needsVariantMapping,
  SYSTEM_PROMPT as VARIANT_PROMPT,
  type VariantClassification,
  type VariantProductRow,
} from "./ai-taxonomy-variants";

const PAGE_SIZE = 500;
const UPDATE_CONCURRENCY = 5;

const vendorById = new Map(VENDOR_TYPE_SEED.map((vendor) => [vendor.id, vendor]));

export async function fetchMerchantsMissingType(
  sb: SupabaseClient,
  limit: number,
): Promise<MerchantRow[]> {
  let query = sb
    .schema("app")
    .from("merchants")
    .select("id,name,vendor_type,strategic_notes")
    .is("vendor_type_id", null)
    .order("id", { ascending: true });
  if (limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to read merchants: ${error.message}`);
  return (data ?? []) as MerchantRow[];
}

export async function classifyMerchants(
  rows: MerchantRow[],
): Promise<MerchantClassification[]> {
  const content = await callDeepSeek([
    { role: "system", content: MERCHANT_PROMPT },
    { role: "user", content: buildMerchantPrompt(rows) },
  ]);
  return coerceMerchantClassifications(extractJsonArray(content), rows);
}

export async function fetchVariableProducts(
  sb: SupabaseClient,
  limit: number,
): Promise<VariantProductRow[]> {
  const rows: VariantProductRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const remaining = limit > 0 ? limit - rows.length : PAGE_SIZE;
    if (remaining <= 0) break;
    const { data, error } = await sb
      .schema("app")
      .from("catalog_products")
      .select("id,name,vendor_type_id,attributes")
      .eq("product_type", "variable")
      .order("id", { ascending: true })
      .range(offset, offset + Math.min(PAGE_SIZE, remaining) - 1);
    if (error) throw new Error(`Failed to read variable products: ${error.message}`);
    const page = (data ?? []) as VariantProductRow[];
    for (const row of page) {
      if (Array.isArray(row.attributes) && needsVariantMapping(row)) rows.push(row);
      if (limit > 0 && rows.length >= limit) break;
    }
    if (page.length < Math.min(PAGE_SIZE, remaining)) break;
  }
  return rows;
}

export async function classifyVariants(
  rows: VariantProductRow[],
): Promise<VariantClassification[]> {
  const content = await callDeepSeek([
    { role: "system", content: VARIANT_PROMPT },
    { role: "user", content: buildVariantPrompt(rows) },
  ]);
  return coerceVariantClassifications(extractJsonArray(content), rows);
}

function reviewPath(kind: string): string {
  const dir = resolve(process.cwd(), ".ai-migration/review");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(dir, `${kind}-${stamp}.json`);
}

export function writeReview(kind: string, items: unknown[]): string | null {
  if (items.length === 0) return null;
  const path = reviewPath(kind);
  writeFileSync(path, JSON.stringify(items, null, 2));
  return path;
}

export async function applyMerchantResults(
  sb: SupabaseClient,
  rows: MerchantRow[],
  results: MerchantClassification[],
  dryRun: boolean,
): Promise<{ written: number; review: unknown[] }> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const review: unknown[] = [];
  if (dryRun) {
    return {
      written: results.filter((result) => !result.needs_human_review).length,
      review: results
        .filter((result) => result.needs_human_review)
        .map((result) => ({ merchant: byId.get(result.id), result })),
    };
  }

  let written = 0;
  for (const result of results) {
    const merchant = byId.get(result.id);
    const vendor = result.vendor_type_id != null ? vendorById.get(result.vendor_type_id) : undefined;
    if (result.needs_human_review || !vendor) {
      review.push({ merchant, result });
      continue;
    }
    try {
      await withRetry(`merchant ${result.id}`, async () => {
        const { error } = await sb
          .schema("app")
          .from("merchants")
          .update({ vendor_type_id: vendor.id, vendor_type: vendor.name_ar })
          .eq("id", result.id);
        if (error) throw new Error(error.message);
      });
      written += 1;
    } catch (error) {
      review.push({
        merchant,
        result,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { written, review };
}

export async function applyVariantResults(
  sb: SupabaseClient,
  rows: VariantProductRow[],
  results: VariantClassification[],
  dryRun: boolean,
): Promise<{ written: number; review: unknown[] }> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const review: unknown[] = [];
  if (dryRun) {
    return {
      written: results.filter((result) => !result.needs_human_review).length,
      review: results
        .filter((result) => result.needs_human_review)
        .map((result) => ({ product: byId.get(result.id), result })),
    };
  }

  let written = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < results.length) {
      const result = results[cursor];
      cursor += 1;
      const product = byId.get(result.id);
      if (!product) continue;
      const attributes = result.needs_human_review
        ? null
        : applyVariantMappings(product, result.mappings);
      try {
        await withRetry(`product ${result.id}`, async () => {
          const { error } = await sb
            .schema("app")
            .from("catalog_products")
            .update(
              attributes
                ? { attributes }
                : { needs_human_review: true },
            )
            .eq("id", result.id);
          if (error) throw new Error(error.message);
        });
        if (attributes) written += 1;
        else review.push({ product, result });
      } catch (error) {
        review.push({
          product,
          result,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(UPDATE_CONCURRENCY, results.length) }, worker),
  );
  return { written, review };
}
