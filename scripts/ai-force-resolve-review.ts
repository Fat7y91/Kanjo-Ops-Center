#!/usr/bin/env -S npx tsx
/**
 * Force-resolve every AI review-queue item and commit the final decision.
 *
 * Sources:
 *  - merchants: latest `.ai-migration/review/ai-enrich-merchants-*.json`
 *  - variants:  latest `.ai-migration/review/ai-enrich-variants-*.json`
 *  - products:  every row with `taxonomy_category_id IS NULL`
 *
 * DeepSeek is instructed to act as the final decision-maker with an internal
 * chain of thought. The 85% safety net is intentionally removed for this pass:
 * every item receives the closest valid catalogue id. If the model returns an
 * invalid or missing id, a deterministic best-match fallback guarantees a valid
 * id so the queue reaches zero.
 *
 * Usage:
 *   npx tsx scripts/ai-force-resolve-review.ts --commit
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { VENDOR_TYPE_SEED } from "../src/lib/taxonomy/data.generated";

import {
  buildForceCategoryPrompt,
  buildForceMerchantPrompt,
  coerceForcedCategories,
  coerceForcedMerchants,
  extractJsonArray,
  FORCE_CATEGORY_PROMPT,
  FORCE_MERCHANT_PROMPT,
} from "./lib/ai-force-resolve";
import {
  buildForceVariantPrompt,
  coerceForcedVariants,
  FORCE_VARIANT_PROMPT,
  forceApplyVariantMappings,
} from "./lib/ai-force-variants";
import type { MerchantRow } from "./lib/ai-taxonomy-merchants";
import type { VariantProductRow } from "./lib/ai-taxonomy-variants";
import {
  fetchTaxonomy,
  fetchUncategorized,
  loadEnvLocal,
  requireEnv,
  withRetry,
} from "./lib/ai-taxonomy-io";
import { callDeepSeek } from "./lib/ai-taxonomy-io";
import {
  fetchMerchantsMissingType,
  fetchVariableProducts,
} from "./lib/ai-taxonomy-enrich-io";

const REVIEW_DIR = resolve(process.cwd(), ".ai-migration/review");
const vendorById = new Map(VENDOR_TYPE_SEED.map((vendor) => [vendor.id, vendor]));

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

function latestReview(kind: string): unknown[] {
  if (!existsSync(REVIEW_DIR)) return [];
  const files = readdirSync(REVIEW_DIR)
    .filter((file) => file.startsWith(kind) && file.endsWith(".json"))
    .sort();
  const file = files.at(-1);
  if (!file) return [];
  try {
    const parsed = JSON.parse(readFileSync(resolve(REVIEW_DIR, file), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function resolveMerchants(sb: SupabaseClient, commit: boolean, batchSize: number, limit: number): Promise<number> {
  const reviewed = latestReview("ai-enrich-merchants-") as Array<{ merchant?: MerchantRow }>;
  const fromFile = reviewed.map((item) => item.merchant).filter((row): row is MerchantRow => Boolean(row?.id));
  let rows = fromFile.length > 0 ? fromFile : await fetchMerchantsMissingType(sb, 0);
  if (limit > 0) rows = rows.slice(0, limit);
  if (rows.length === 0) {
    console.log("Merchants: queue already empty.");
    return 0;
  }

  const results = [];
  for (const batch of chunks(rows, batchSize)) {
    try {
      const content = await callDeepSeek([
        { role: "system", content: FORCE_MERCHANT_PROMPT },
        { role: "user", content: buildForceMerchantPrompt(batch) },
      ]);
      results.push(...coerceForcedMerchants(extractJsonArray(content), batch));
    } catch (error) {
      console.error(`  ! merchant batch fell back: ${error instanceof Error ? error.message : String(error)}`);
      results.push(...coerceForcedMerchants([], batch));
    }
  }

  if (commit) {
    await runPool(results, 5, async (result) => {
      const vendor = vendorById.get(result.vendor_type_id);
      if (!vendor) return;
      await withRetry(`merchant ${result.id}`, async () => {
        const { error } = await sb
          .schema("app")
          .from("merchants")
          .update({ vendor_type_id: vendor.id, vendor_type: vendor.name_ar })
          .eq("id", result.id);
        if (error) throw new Error(error.message);
      });
    });
  }
  const fallback = results.filter((result) => result.source === "fallback").length;
  console.log(`Merchants: ${results.length} resolved (fallback=${fallback})${commit ? " and committed" : " [dry run]"}.`);
  return results.length;
}

async function resolveProducts(sb: SupabaseClient, commit: boolean, batchSize: number, limit: number): Promise<number> {
  let rows = await fetchUncategorized(sb, 0);
  if (limit > 0) rows = rows.slice(0, limit);
  if (rows.length === 0) {
    console.log("Products: queue already empty.");
    return 0;
  }
  const taxonomy = await fetchTaxonomy(sb);
  const results = [];
  for (const batch of chunks(rows, batchSize)) {
    try {
      const content = await callDeepSeek([
        { role: "system", content: FORCE_CATEGORY_PROMPT },
        { role: "user", content: buildForceCategoryPrompt(batch, taxonomy) },
      ]);
      results.push(...coerceForcedCategories(extractJsonArray(content), batch, taxonomy));
    } catch (error) {
      console.error(`  ! product batch fell back: ${error instanceof Error ? error.message : String(error)}`);
      results.push(...coerceForcedCategories([], batch, taxonomy));
    }
  }

  if (commit) {
    const now = new Date().toISOString();
    await runPool(results, 5, async (result) => {
      await withRetry(`product ${result.id}`, async () => {
        const { error } = await sb
          .schema("app")
          .from("catalog_products")
          .update({
            taxonomy_category_id: result.taxonomy_category_id,
            ai_confidence_score: result.confidence,
            ai_categorized_at: now,
            needs_human_review: false,
          })
          .eq("id", result.id);
        if (error) throw new Error(error.message);
      });
    });
  }
  const fallback = results.filter((result) => result.source === "fallback").length;
  console.log(`Products: ${results.length} resolved (fallback=${fallback})${commit ? " and committed" : " [dry run]"}.`);
  return results.length;
}

async function resolveVariants(sb: SupabaseClient, commit: boolean, batchSize: number, limit: number): Promise<number> {
  const reviewed = latestReview("ai-enrich-variants-") as Array<{ product?: VariantProductRow }>;
  const fromFile = reviewed
    .map((item) => item.product)
    .filter((row): row is VariantProductRow => Boolean(row?.id && Array.isArray(row.attributes)));
  let rows = fromFile.length > 0 ? fromFile : await fetchVariableProducts(sb, 0);
  if (limit > 0) rows = rows.slice(0, limit);
  if (rows.length === 0) {
    console.log("Variants: queue already empty.");
    return 0;
  }

  const results = [];
  for (const batch of chunks(rows, batchSize)) {
    try {
      const content = await callDeepSeek([
        { role: "system", content: FORCE_VARIANT_PROMPT },
        { role: "user", content: buildForceVariantPrompt(batch) },
      ]);
      results.push(...coerceForcedVariants(extractJsonArray(content), batch));
    } catch (error) {
      console.error(`  ! variant batch fell back: ${error instanceof Error ? error.message : String(error)}`);
      results.push(...coerceForcedVariants([], batch));
    }
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  if (commit) {
    await runPool(results, 5, async (result) => {
      const product = byId.get(result.id);
      if (!product) return;
      const attributes = forceApplyVariantMappings(product, result.mappings);
      await withRetry(`variant ${result.id}`, async () => {
        const { error } = await sb
          .schema("app")
          .from("catalog_products")
          .update({ attributes, needs_human_review: false })
          .eq("id", result.id);
        if (error) throw new Error(error.message);
      });
    });
  }
  const fallback = results.filter((result) => result.source !== "model").length;
  console.log(`Variants: ${results.length} resolved (fallback/mixed=${fallback})${commit ? " and committed" : " [dry run]"}.`);
  return results.length;
}

async function count(sb: SupabaseClient, table: string, apply: (query: ReturnType<SupabaseClient["schema"]> extends never ? never : any) => any): Promise<number> {
  const query = apply(sb.schema("app").from(table).select("id", { count: "exact", head: true }));
  const { count: value, error } = await query;
  if (error) throw new Error(`Count ${table} failed: ${error.message}`);
  return value ?? 0;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const commit = process.argv.includes("--commit");
  const sizeArg = process.argv.find((arg) => arg.startsWith("--batch-size="));
  const batchSize = Number.parseInt(sizeArg?.split("=")[1] ?? "", 10) || 40;
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = Number.parseInt(limitArg?.split("=")[1] ?? "", 10) || 0;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  const sb = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "kanjo-ai-force-resolve" } },
  });

  console.log(`Force-resolve${commit ? "" : " (DRY RUN)"} — batch=${batchSize}${limit > 0 ? ` limit=${limit}` : ""}`);
  const started = Date.now();
  const resolved =
    (await resolveMerchants(sb, commit, batchSize, limit)) +
    (await resolveProducts(sb, commit, batchSize, limit)) +
    (await resolveVariants(sb, commit, batchSize, limit));

  const flags = await Promise.all([
    count(sb, "catalog_products", (q) => q.is("taxonomy_category_id", null)),
    count(sb, "catalog_products", (q) => q.eq("needs_human_review", true)),
    count(sb, "merchants", (q) => q.is("vendor_type_id", null)),
    count(sb, "merchants", (q) => q.eq("vendor_type", "")),
  ]);
  const unmappedVariants = commit ? (await fetchVariableProducts(sb, 0)).length : -1;

  mkdirSync(REVIEW_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = resolve(REVIEW_DIR, `ai-force-resolved-${stamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        commit,
        resolved,
        remaining: {
          productsWithoutCategory: flags[0],
          productsNeedingReview: flags[1],
          merchantsWithoutTypeId: flags[2],
          merchantsWithoutTypeText: flags[3],
          variableProductsWithoutVariantIds: unmappedVariants,
        },
      },
      null,
      2,
    ),
  );

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nRemaining: category=null ${flags[0]}, review=true ${flags[1]}, merchant type=null ${flags[2]}, merchant text empty ${flags[3]}, unmapped variants ${unmappedVariants === -1 ? "skipped" : unmappedVariants}.`);
  console.log(`Report: ${reportPath} (${seconds}s)`);
  if (!commit) console.log("Dry run: no rows were written.");
}

main().catch((error) => {
  console.error("\nFORCE-RESOLVE FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
