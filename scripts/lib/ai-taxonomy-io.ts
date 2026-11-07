/**
 * I/O layer for the AI taxonomy batch classifier.
 *
 * Supabase reads/writes and the DeepSeek transport live here so the executable
 * script stays a thin orchestration loop and the pure matching logic stays in
 * `ai-taxonomy-core.ts`.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTaxonomy,
  buildUserPrompt,
  allowedCategoryIds,
  candidateCategories,
  coerceClassifications,
  extractJsonArray,
  SYSTEM_PROMPT,
  type Classification,
  type ProductRow,
  type Taxonomy,
  type TaxonomyNode,
} from "./ai-taxonomy-core";

const MAX_API_ATTEMPTS = 5;
const UPDATE_CONCURRENCY = 5;

/** Minimal .env.local reader, matching the other scripts in this folder. */
export function loadEnvLocal(): void {
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
  }
}

export function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

/* ────────────────────────────── taxonomy ────────────────────────────── */

export async function fetchTaxonomy(sb: SupabaseClient): Promise<Taxonomy> {
  const { data, error } = await sb
    .schema("app")
    .from("taxonomy_categories")
    .select("id,parent_id,vendor_type,name_ar,name_en,level")
    .order("level", { ascending: true });

  if (error) {
    if (error.code === "42501") {
      throw new Error(
        "Cannot read app.taxonomy_categories (42501). Grant access first:\n" +
          "  GRANT SELECT ON app.taxonomy_categories TO service_role;",
      );
    }
    throw new Error(`Failed to load taxonomy: ${error.message}`);
  }

  const nodes = (data ?? []) as TaxonomyNode[];
  if (nodes.length === 0) {
    throw new Error(
      "app.taxonomy_categories is empty — seed the taxonomy before running.",
    );
  }
  return buildTaxonomy(nodes);
}

/* ──────────────────────────── deepseek api ──────────────────────────── */

export function deepSeekConfig() {
  return {
    apiKey: requireEnv("DEEPSEEK_API_KEY"),
    baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  };
}

export async function callDeepSeek(
  messages: { role: "system" | "user"; content: string }[],
): Promise<string> {
  const { apiKey, baseUrl, model } = deepSeekConfig();
  let lastError: Error = new Error("DeepSeek call never executed");

  for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, temperature: 0.1, stream: false, messages }),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new Error("DeepSeek returned an empty completion");
        return content;
      }

      const body = await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new Error(`DeepSeek HTTP ${response.status}: ${body.slice(0, 200)}`);
      if (!retryable) throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < MAX_API_ATTEMPTS) {
      const delay = Math.min(30_000, 1_000 * 2 ** (attempt - 1)) + Math.random() * 500;
      console.warn(
        `  ! DeepSeek attempt ${attempt}/${MAX_API_ATTEMPTS} failed (${lastError.message.slice(0, 120)}); retrying in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export async function classifyBatch(
  products: ProductRow[],
  taxonomy: Taxonomy,
): Promise<Classification[]> {
  const categories = new Map<string, TaxonomyNode>();
  for (const product of products) {
    for (const node of candidateCategories(product, taxonomy)) {
      categories.set(node.id, node);
    }
  }
  const content = await callDeepSeek([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(products, taxonomy, [...categories.values()]) },
  ]);
  // Validation is per product: a batch-level set would let a restaurant item
  // be accepted into a pharmacy category whenever the batch mixed verticals.
  return coerceClassifications(
    extractJsonArray(content),
    products,
    (product) => allowedCategoryIds(product, taxonomy),
  );
}

/* ───────────────────────────── persistence ──────────────────────────── */

export async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: Error = new Error(`${label} never executed`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

export async function applyResults(
  sb: SupabaseClient,
  results: Classification[],
  dryRun: boolean,
): Promise<number> {
  if (results.length === 0) return 0;
  if (dryRun) return results.length;

  const now = new Date().toISOString();
  let written = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < results.length) {
      const item = results[cursor];
      cursor += 1;
      try {
        await withRetry(`update ${item.id}`, async () => {
          const { error } = await sb
            .schema("app")
            .from("catalog_products")
            .update({
              taxonomy_category_id: item.taxonomy_category_id,
              ai_confidence_score: item.confidence,
              ai_categorized_at: now,
              needs_human_review: item.needs_human_review,
            })
            .eq("id", item.id);
          if (error) throw new Error(error.message);
        });
        written += 1;
      } catch (error) {
        console.error(
          `  ! ${item.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(UPDATE_CONCURRENCY, results.length) }, worker),
  );
  return written;
}

export async function fetchUncategorized(
  sb: SupabaseClient,
  limit: number,
): Promise<ProductRow[]> {
  const rows: ProductRow[] = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const remaining = limit > 0 ? limit - rows.length : pageSize;
    if (remaining <= 0) break;

    const { data, error } = await sb
      .schema("app")
      .from("catalog_products")
      .select("id,name,description,vendor_type_id,merchants(vendor_type,vendor_type_id)")
      .is("taxonomy_category_id", null)
      .order("id", { ascending: true })
      .range(offset, offset + Math.min(pageSize, remaining) - 1);

    if (error) throw new Error(`Failed to read catalog_products: ${error.message}`);

    const page = (data ?? []) as unknown as ProductRow[];
    rows.push(...page);
    if (page.length < Math.min(pageSize, remaining)) break;
  }
  return rows;
}
