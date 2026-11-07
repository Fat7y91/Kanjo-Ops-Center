#!/usr/bin/env -S npx tsx
/**
 * AI catalog taxonomy batch classifier.
 *
 * Reads every `app.catalog_products` row whose `taxonomy_category_id` is still
 * NULL, asks DeepSeek to map each product onto an existing category, and writes
 * `taxonomy_category_id`, `ai_confidence_score`, `ai_categorized_at` and
 * `needs_human_review` back.
 *
 * Pure prompt/matching logic lives in `scripts/lib/ai-taxonomy-core.ts`; the
 * Supabase and DeepSeek transports live in `scripts/lib/ai-taxonomy-io.ts`.
 *
 * Design notes (measured against the live database, not assumed):
 *
 *  • The taxonomy is the source of truth and is fetched from
 *    `app.taxonomy_categories`. `service_role` currently needs
 *      GRANT SELECT ON app.taxonomy_categories TO service_role;
 *    without it the preflight stops with that exact instruction.
 *
 *  • Writes use per-row UPDATE, never upsert. PostgREST resolves an upsert to
 *    `INSERT ... ON CONFLICT`, and because `catalog_products.merchant_id` is NOT
 *    NULL the insert branch fails before any conflict is considered
 *    (`23502`). Updates are concurrency-limited and retried.
 *
 *  • `ai_confidence_score` is stored as a percentage (0–100), matching the
 *    "< 85%" rule in the spec. One constant, CONFIDENCE_THRESHOLD, owns it.
 *
 * Credentials:
 *   DEEPSEEK_API_KEY      required. Never read from any agent/LLM env var.
 *   DEEPSEEK_BASE_URL     optional, default https://api.deepseek.com
 *   DEEPSEEK_MODEL        optional, default deepseek-chat
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   npx tsx scripts/ai-taxonomy-batch.ts --dry-run
 *   npx tsx scripts/ai-taxonomy-batch.ts --limit 20
 *   npx tsx scripts/ai-taxonomy-batch.ts --batch-size 50 --retry-reviewed
 */

import { createClient } from "@supabase/supabase-js";

import type { Classification } from "./lib/ai-taxonomy-core";
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
  };
}

/* ──────────────────────────────── main ──────────────────────────────── */

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");

  // Mirrors the server client in src/lib/db/supabase/server.ts, which cannot be
  // imported here: it is marked `server-only` and throws outside Next.js.
  const sb = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "kanjo-ai-taxonomy-batch" } },
  });

  console.log(
    `AI taxonomy batch${args.dryRun ? " (DRY RUN)" : ""} — model=${process.env.DEEPSEEK_MODEL || "deepseek-chat"} batch=${args.batchSize}`,
  );

  const taxonomy = await fetchTaxonomy(sb);
  console.log(
    `Taxonomy: ${taxonomy.nodes.length} categories across ${taxonomy.byVendorType.size} vendor types.`,
  );

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
      console.log(
        `Skipping ${before - products.length} already flagged for human review (use --retry-reviewed to include).`,
      );
    }
  }

  if (products.length === 0) {
    console.log("Nothing to categorize.");
    return;
  }
  console.log(`Uncategorized products: ${products.length}.`);

  const started = Date.now();
  let categorized = 0;
  let flagged = 0;
  let written = 0;

  for (let start = 0, chunk = 1; start < products.length; start += args.batchSize, chunk += 1) {
    const batch = products.slice(start, start + args.batchSize);
    console.log(
      `\n[chunk ${chunk}] classifying ${batch.length} products (${start + 1}-${start + batch.length} of ${products.length})…`,
    );

    let results: Classification[];
    try {
      results = await classifyBatch(batch, taxonomy);
    } catch (error) {
      console.error(
        `  ! chunk ${chunk} failed, leaving its products untouched: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const matched = results.filter((r) => r.taxonomy_category_id !== null).length;
    const review = results.filter((r) => r.needs_human_review).length;
    categorized += matched;
    flagged += review;

    const saved = await applyResults(sb, results, args.dryRun);
    written += saved;
    console.log(
      `  matched=${matched} needs_review=${review} ${args.dryRun ? "would write" : "written"}=${saved}`,
    );
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log("\n────────── summary ──────────");
  console.log(`products processed      ${products.length}`);
  console.log(`categorized             ${categorized}`);
  console.log(`needs human review      ${flagged}`);
  console.log(`${args.dryRun ? "would write" : "written"}            ${written}`);
  console.log(`elapsed                 ${seconds}s`);
  if (args.dryRun) console.log("\nDry run: no rows were written.");
}

main().catch((error) => {
  console.error("\nAI TAXONOMY BATCH FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
