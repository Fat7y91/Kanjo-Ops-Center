#!/usr/bin/env -S npx tsx
/**
 * AI catalog taxonomy and legacy-data enrichment batch.
 *
 * Runs three confidence-gated DeepSeek passes and writes only high-confidence
 * results back to the live database:
 *
 *  1. merchants  — fill missing `vendor_type_id` + `vendor_type`
 *  2. categories — fill `catalog_products.taxonomy_category_id`
 *  3. variants   — map legacy `attributes[].variantLabel` text onto the
 *                  standard global variant/option ids
 *
 * Anything below the 85% threshold is left untouched and written to
 * `.ai-migration/review/` for a human reviewer.
 *
 * Pure prompt/matching logic lives in `scripts/lib/ai-taxonomy-core.ts`,
 * `ai-taxonomy-merchants.ts` and `ai-taxonomy-variants.ts`; Supabase and
 * DeepSeek transports live in `scripts/lib/ai-taxonomy-*.ts`.
 *
 * Credentials:
 *   DEEPSEEK_API_KEY      required. Never read from any agent/LLM env var.
 *   DEEPSEEK_BASE_URL     optional, default https://api.deepseek.com
 *   DEEPSEEK_MODEL        optional, default deepseek-chat
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   npx tsx scripts/ai-taxonomy-batch.ts --dry-run
 *   npx tsx scripts/ai-taxonomy-batch.ts --skip-categories --limit 20
 *   npx tsx scripts/ai-taxonomy-batch.ts --skip-merchants --skip-variants
 *   npx tsx scripts/ai-taxonomy-batch.ts --batch-size 50 --retry-reviewed
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Classification } from "./lib/ai-taxonomy-core";
import {
  localMerchantType,
  type MerchantClassification,
  type MerchantRow,
} from "./lib/ai-taxonomy-merchants";
import {
  splitVariantProducts,
  type VariantClassification,
} from "./lib/ai-taxonomy-variants";
import {
  applyMerchantResults,
  applyVariantResults,
  classifyMerchants,
  classifyVariants,
  fetchMerchantsMissingType,
  fetchVariableProducts,
  writeReview,
} from "./lib/ai-taxonomy-enrich-io";
import {
  applyResults,
  classifyBatch,
  fetchTaxonomy,
  fetchUncategorized,
  loadEnvLocal,
  requireEnv,
} from "./lib/ai-taxonomy-io";

const DEFAULT_BATCH_SIZE = 50;

type Args = {
  dryRun: boolean;
  limit: number;
  batchSize: number;
  retryReviewed: boolean;
  skipMerchants: boolean;
  skipCategories: boolean;
  skipVariants: boolean;
};

function parseArgs(argv: string[]): Args {
  const inline = (name: string) => {
    const hit = argv.find((a) => a.startsWith(`${name}=`));
    return hit ? hit.slice(name.length + 1) : "";
  };
  const valueOf = (name: string) => {
    const i = argv.indexOf(name);
    const raw = inline(name) || (i !== -1 ? argv[i + 1] ?? "" : "");
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    limit: valueOf("--limit"),
    batchSize: valueOf("--batch-size") || DEFAULT_BATCH_SIZE,
    retryReviewed: argv.includes("--retry-reviewed"),
    skipMerchants: argv.includes("--skip-merchants"),
    skipCategories: argv.includes("--skip-categories"),
    skipVariants: argv.includes("--skip-variants"),
  };
}

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function runMerchants(sb: SupabaseClient, args: Args): Promise<void> {
  const rows = await fetchMerchantsMissingType(sb, args.limit);
  if (rows.length === 0) {
    console.log("Merchants: nothing missing a vendor type.");
    return;
  }
  const local: MerchantClassification[] = [];
  const pending: MerchantRow[] = [];
  for (const row of rows) {
    const vendorTypeId = localMerchantType(row);
    if (vendorTypeId == null) pending.push(row);
    else
      local.push({
        id: row.id,
        vendor_type_id: vendorTypeId,
        confidence: 100,
        needs_human_review: false,
      });
  }
  console.log(`Merchants missing type: ${rows.length} (local=${local.length}, ai=${pending.length}).`);

  const results: MerchantClassification[] = [...local];
  for (const [index, chunk] of chunks(pending, args.batchSize).entries()) {
    console.log(`  merchant batch ${index + 1}: ${chunk.length} rows`);
    try {
      results.push(...(await classifyMerchants(chunk)));
    } catch (error) {
      console.error(`  ! merchant batch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const { written, review } = await applyMerchantResults(sb, rows, results, args.dryRun);
  const path = writeReview("ai-enrich-merchants", review);
  console.log(
    `Merchants: ${args.dryRun ? "would write" : "written"}=${written}, review=${review.length}${path ? ` (${path})` : ""}.`,
  );
}

async function runCategories(sb: SupabaseClient, args: Args): Promise<void> {
  const taxonomy = await fetchTaxonomy(sb);
  console.log(`Taxonomy: ${taxonomy.nodes.length} categories across ${taxonomy.byVendorType.size} vendor types.`);

  let products = await fetchUncategorized(sb, args.limit);
  if (!args.retryReviewed) {
    const { data: flagged } = await sb
      .schema("app")
      .from("catalog_products")
      .select("id")
      .is("taxonomy_category_id", null)
      .eq("needs_human_review", true);
    const skip = new Set((flagged ?? []).map((r) => (r as { id: string }).id));
    const before = products.length;
    products = products.filter((p) => !skip.has(p.id));
    if (before !== products.length) {
      console.log(`Skipping ${before - products.length} flagged products (use --retry-reviewed to include).`);
    }
  }
  if (products.length === 0) {
    console.log("Categories: nothing to categorize.");
    return;
  }
  console.log(`Uncategorized products: ${products.length}.`);

  let categorized = 0;
  let flagged = 0;
  let written = 0;
  for (const [index, batch] of chunks(products, args.batchSize).entries()) {
    console.log(`  category batch ${index + 1}: ${batch.length} products`);
    let results: Classification[];
    try {
      results = await classifyBatch(batch, taxonomy);
    } catch (error) {
      console.error(`  ! category batch failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    categorized += results.filter((r) => r.taxonomy_category_id !== null).length;
    flagged += results.filter((r) => r.needs_human_review).length;
    written += await applyResults(sb, results, args.dryRun);
  }
  console.log(
    `Categories: matched=${categorized}, review=${flagged}, ${args.dryRun ? "would write" : "written"}=${written}.`,
  );
}

async function runVariants(sb: SupabaseClient, args: Args): Promise<void> {
  const rows = await fetchVariableProducts(sb, args.limit);
  if (rows.length === 0) {
    console.log("Variants: nothing to map.");
    return;
  }
  const { local, pending } = splitVariantProducts(rows);
  console.log(`Legacy variant products: ${rows.length} (local=${local.length}, ai=${pending.length}).`);

  const results: VariantClassification[] = [...local];
  for (const [index, batch] of chunks(pending, args.batchSize).entries()) {
    console.log(`  variant batch ${index + 1}: ${batch.length} products`);
    try {
      results.push(...(await classifyVariants(batch)));
    } catch (error) {
      console.error(`  ! variant batch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const { written, review } = await applyVariantResults(sb, rows, results, args.dryRun);
  const path = writeReview("ai-enrich-variants", review);
  console.log(
    `Variants: ${args.dryRun ? "would write" : "written"}=${written}, review=${review.length}${path ? ` (${path})` : ""}.`,
  );
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  const sb = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "kanjo-ai-taxonomy-batch" } },
  });

  console.log(
    `AI taxonomy batch${args.dryRun ? " (DRY RUN)" : ""} — model=${process.env.DEEPSEEK_MODEL || "deepseek-chat"} batch=${args.batchSize}`,
  );

  const started = Date.now();
  if (!args.skipMerchants) await runMerchants(sb, args);
  if (!args.skipCategories) await runCategories(sb, args);
  if (!args.skipVariants) await runVariants(sb, args);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nElapsed ${seconds}s`);
  if (args.dryRun) console.log("Dry run: no rows were written.");
}

main().catch((error) => {
  console.error("\nAI TAXONOMY BATCH FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
