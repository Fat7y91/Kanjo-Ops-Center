#!/usr/bin/env node
/**
 * Rewrites legacy catalog variation rows against the synced variant dictionary.
 *
 * Rows already carrying a valid dictionary pair are preserved. Rows stuck on
 * the dummy taste pair (2:7) or with no variant are resolved from their
 * `variantLabel` through `scripts/lib/catalog/variant-remap.ts`, which never
 * falls back to the dummy pair for a real label.
 *
 * Usage:
 *   npx tsx scripts/remap-variant-attributes.ts
 *   npx tsx scripts/remap-variant-attributes.ts --apply
 *   npx tsx scripts/remap-variant-attributes.ts --apply --limit=50
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

import { loadEnvLocal, requireEnv } from "./lib/ai-migration/env";
import { normalizeName } from "./lib/catalog/product-values";
import {
  buildPhrases,
  isDummyTaste,
  isRegularLabel,
  mapLabel,
  type Dictionary,
  type Pair,
} from "./lib/catalog/variant-remap";

type Attribute = Record<string, unknown> & {
  variantId?: number | string | null;
  optionIds?: number[];
  variantLabel?: string;
};

type ProductRow = {
  id: string;
  name: string;
  vendor_type_id: number | null;
  category_key: string | null;
  attributes: Attribute[];
};

type Stats = {
  products: number;
  changedProducts: number;
  rows: number;
  preserved: number;
  remapped: number;
  dropped: number;
  unmappedRows: number;
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? 0);
const reportPath = resolve(
  process.cwd(),
  args.find((arg) => arg.startsWith("--json="))?.slice(7) ?? "/tmp/variant-remap-report.json",
);

function pairKey(pair: Pair): string {
  return `${pair.variantId}:${pair.optionId}`;
}

function toPair(variantId: unknown, optionIds: unknown): Pair | null {
  const id = Number(variantId);
  if (!Number.isInteger(id)) return null;
  const first = Array.isArray(optionIds) ? Number(optionIds[0]) : NaN;
  return Number.isInteger(first) ? { variantId: id, optionId: first } : null;
}

function labelFor(attribute: Attribute, dictionary: Dictionary): string {
  const raw = typeof attribute.variantLabel === "string" ? attribute.variantLabel.trim() : "";
  if (raw) return raw;
  const pair = toPair(attribute.variantId, attribute.optionIds);
  if (!pair) return "";
  const option = dictionary.options.find(
    (item) => item.variantId === pair.variantId && item.optionId === pair.optionId,
  );
  return option?.nameAr ?? "";
}

async function loadDictionary(client: Client): Promise<Dictionary> {
  const result = await client.query<{
    variant_id: number;
    name_ar: string;
    option_id: number;
    option_name_ar: string;
    option_name_en: string | null;
  }>(
    `select a.id as variant_id, a.name_ar, o.id as option_id,
            o.name_ar as option_name_ar, o.name_en as option_name_en
       from app.variant_attributes a
       join app.variant_options o on o.variant_id = a.id
      order by a.id, o.id`,
  );
  const groupNames = new Map<number, string>();
  const options = result.rows.map((row) => {
    groupNames.set(Number(row.variant_id), row.name_ar);
    return {
      variantId: Number(row.variant_id),
      optionId: Number(row.option_id),
      nameAr: row.option_name_ar,
      nameEn: row.option_name_en ?? "",
    };
  });
  return { options, groupNames };
}

function remapProduct(row: ProductRow, dictionary: Dictionary, stats: Stats) {
  const phrases = buildPhrases(dictionary);
  const context = {
    productName: row.name,
    vendorTypeId: row.vendor_type_id,
    categoryName: row.category_key ?? "",
  };
  const valid = phrases.valid;
  const next: Attribute[] = [];

  for (const attribute of row.attributes) {
    const current = toPair(attribute.variantId, attribute.optionIds);
    const label = labelFor(attribute, dictionary);
    const dummy = current ? isDummyTaste(current) && !isRegularLabel(label) : false;
    const invalid = !current || !valid.has(pairKey(current));

    const mapping = label
      ? mapLabel(
          {
            label,
            variantId: current?.variantId ?? null,
            optionIds: attribute.optionIds ?? [],
          },
          dictionary,
          phrases,
          context,
        )
      : null;
    const usable = (mapping?.pairs ?? []).filter(
      (pair) => isRegularLabel(label) || !isDummyTaste(pair),
    );
    const pairs = usable;
    const keepsCurrent =
      current != null &&
      !dummy &&
      (pairs.length === 0 ||
        (pairs.length === 1 && pairKey(pairs[0]) === pairKey(current)));

    if (keepsCurrent) {
      next.push(attribute);
      stats.preserved += 1;
      continue;
    }

    if (pairs.length === 0) {
      if (dummy) {
        stats.dropped += 1;
      } else {
        next.push(attribute);
        stats.unmappedRows += 1;
      }
      continue;
    }

    for (const pair of pairs) {
      next.push({
        ...attribute,
        variantId: pair.variantId,
        optionIds: [pair.optionId],
        variantLabel: attribute.variantLabel || label,
      });
      stats.remapped += 1;
    }
  }

  stats.rows += row.attributes.length;
  return next;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const client = new Client({ connectionString: requireEnv("DATABASE_URL") });
  await client.connect();
  const stats: Stats = {
    products: 0,
    changedProducts: 0,
    rows: 0,
    preserved: 0,
    remapped: 0,
    dropped: 0,
    unmappedRows: 0,
  };
  const unmapped: Array<{ product: string; label: string }> = [];
  const samples: Array<{ product: string; before: unknown[]; after: Attribute[] }> = [];

  try {
    const dictionary = await loadDictionary(client);
    const query = `select id, name, vendor_type_id, category_key, attributes
                     from app.catalog_products
                    where jsonb_array_length(attributes) > 0
                    order by updated_at desc${limit > 0 ? ` limit ${limit}` : ""}`;
    const products = await client.query<ProductRow>(query);

    await client.query("begin");
    for (const row of products.rows) {
      stats.products += 1;
      const next = remapProduct(row, dictionary, stats);
      const before = JSON.stringify(row.attributes);
      const after = JSON.stringify(next);
      if (before === after) continue;
      stats.changedProducts += 1;
      if (samples.length < 8) samples.push({ product: row.name, before: row.attributes, after: next });
      for (const attribute of row.attributes) {
        const label = labelFor(attribute, dictionary);
        const pair = toPair(attribute.variantId, attribute.optionIds);
        const mapped = next.some((item) => labelFor(item, dictionary) === label);
        if (!mapped && pair && isDummyTaste(pair)) unmapped.push({ product: row.name, label });
      }
      if (apply) {
        await client.query(
          "update app.catalog_products set attributes = $1::jsonb, updated_at = now() where id = $2",
          [after, row.id],
        );
      }
    }
    if (apply) await client.query("commit");
    else await client.query("rollback");

    const report = {
      generatedAt: new Date().toISOString(),
      applied: apply,
      limit: limit || null,
      stats,
      unmapped,
      samples,
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\nVariant attribute remap (${apply ? "APPLY" : "DRY RUN"})`);
    console.log(`  Products scanned        ${stats.products}`);
    console.log(`  Products changed        ${stats.changedProducts}`);
    console.log(`  Rows                    ${stats.rows}`);
    console.log(`  Preserved valid rows    ${stats.preserved}`);
    console.log(`  Remapped rows           ${stats.remapped}`);
    console.log(`  Dropped dummy rows      ${stats.dropped}`);
    console.log(`  Still unmapped rows     ${stats.unmappedRows}`);
    console.log(`  Report                  ${reportPath}`);
    console.log(`\n--- SAMPLE ---`);
    for (const sample of samples) {
      console.log(`\n${sample.product}`);
      for (const attribute of sample.after) {
        console.log(`  → ${String(attribute.variantId)}:${(attribute.optionIds ?? []).join(",")}  ${attribute.variantLabel ?? ""}`);
      }
    }
    if (unmapped.length) {
      console.log(`\n--- UNMAPPED DUMMY LABELS (first 20) ---`);
      for (const item of unmapped.slice(0, 20)) console.log(`  ${item.product}: ${item.label}`);
    }
  } catch (error) {
    if (apply) await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
