import { VENDOR_TYPE_SEED } from "../../src/lib/taxonomy/data.generated";
import { smartTextScore } from "../../src/lib/search/normalize";

import {
  candidateCategories,
  extractJsonArray,
  parentPath,
  vendorCandidates,
  type ProductRow,
  type Taxonomy,
  type TaxonomyNode,
} from "./ai-taxonomy-core";
import type { MerchantRow } from "./ai-taxonomy-merchants";

export type ForcedCategory = {
  id: string;
  taxonomy_category_id: string;
  confidence: number;
  source: "model" | "fallback";
};

export type ForcedMerchant = {
  id: string;
  vendor_type_id: number;
  confidence: number;
  source: "model" | "fallback";
};

export const FORCE_CATEGORY_PROMPT = `You are the FINAL catalog taxonomy decision-maker for an Egyptian quick-commerce operator.
Every product MUST be assigned exactly one category id from the supplied list. Manual review is not allowed.

Think step by step internally about the product name, description, merchant vendor type and the candidate list.
Then output only the decision.

Rules:
- Use ONLY category ids from the supplied list. Never invent an id.
- Choose the closest same-vendor-type category even when the product name is noisy or abbreviated.
- If no category is a strong fit, choose the nearest parent/root category for that vendor type.
- Every product must have a non-null taxonomy_category_id.
- confidence is an integer 0-100. You still choose the best match when confidence is low.
- Return a STRICT JSON array, no prose and no markdown fences:
  [{"id":"<product id>","taxonomy_category_id":"<uuid>","confidence":<0-100>}]
- Return exactly one object per input product.`;

export function buildForceCategoryPrompt(
  products: ProductRow[],
  taxonomy: Taxonomy,
): string {
  const categories = new Map<string, TaxonomyNode>();
  for (const product of products) {
    for (const node of candidateCategories(product, taxonomy)) {
      categories.set(node.id, node);
    }
  }
  const categoryLines = [...categories.values()].map(
    (node) =>
      `${node.id} | vendor_type=${node.vendor_type} | ${parentPath(node, taxonomy.byId)} | ar=${node.name_ar} | en=${node.name_en ?? ""}`,
  );
  const productLines = products.map((product) => {
    const vendor = vendorCandidates(product)[0] ?? "unknown";
    const description = (product.description ?? "").replace(/\s+/g, " ").slice(0, 180);
    return `${product.id} | vendor_type=${vendor} | name=${product.name} | description=${description}`;
  });
  return [
    "CATEGORIES (id | vendor type | path | Arabic | English):",
    ...categoryLines,
    "",
    "PRODUCTS (id | vendor type | name | description):",
    ...productLines,
    "",
    "Return the strict JSON array now. Every id must appear with a valid category id.",
  ].join("\n");
}

function bestCategory(product: ProductRow, taxonomy: Taxonomy): TaxonomyNode {
  const candidates = candidateCategories(product, taxonomy);
  if (candidates.length === 0) {
    return taxonomy.nodes[0];
  }
  const query = `${product.name} ${product.description ?? ""}`;
  let best = candidates[0];
  let bestScore = -1;
  for (const node of candidates) {
    const text = `${node.name_ar} ${node.name_en ?? ""} ${parentPath(node, taxonomy.byId)}`;
    const score = smartTextScore(query, text).score;
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}

export function coerceForcedCategories(
  raw: unknown[],
  products: ProductRow[],
  taxonomy: Taxonomy,
): ForcedCategory[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const proposed = new Map<string, { id: string; confidence: number }>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const categoryId =
      typeof record.taxonomy_category_id === "string"
        ? record.taxonomy_category_id.trim()
        : "";
    if (byId.has(id) && categoryId) {
      proposed.set(id, {
        id: categoryId,
        confidence: Math.max(0, Math.min(100, Number(record.confidence) || 0)),
      });
    }
  }

  return products.map((product) => {
    const allowed = new Set(candidateCategories(product, taxonomy).map((node) => node.id));
    const choice = proposed.get(product.id);
    if (choice && allowed.has(choice.id)) {
      return {
        id: product.id,
        taxonomy_category_id: choice.id,
        confidence: choice.confidence,
        source: "model" as const,
      };
    }
    return {
      id: product.id,
      taxonomy_category_id: bestCategory(product, taxonomy).id,
      confidence: 60,
      source: "fallback" as const,
    };
  });
}

export const FORCE_MERCHANT_PROMPT = `You are the FINAL merchant classification decision-maker for an Egyptian quick-commerce operator.
Every merchant MUST be assigned exactly one vendor_type_id from the supplied list. Manual review is not allowed.

Think step by step internally about the store name, legacy category text and notes. Then output only the decision.

Rules:
- Use ONLY vendor_type_id values from the supplied list. Never invent an id.
- Pick the closest vendor type even when the store name is ambiguous or the legacy category is generic.
- Every merchant must have a non-null vendor_type_id.
- confidence is an integer 0-100. You still choose the closest match when confidence is low.
- Return a STRICT JSON array, no prose and no markdown fences:
  [{"id":"<merchant id>","vendor_type_id":<id>,"confidence":<0-100>}]
- Return exactly one object per input merchant.`;

export function buildForceMerchantPrompt(merchants: MerchantRow[]): string {
  const types = VENDOR_TYPE_SEED.map(
    (vendor) => `${vendor.id} | ar=${vendor.name_ar} | en=${vendor.name_en}`,
  );
  const rows = merchants.map((merchant) => {
    const notes = (merchant.strategic_notes ?? "").replace(/\s+/g, " ").slice(0, 140);
    return `${merchant.id} | name=${merchant.name} | category=${merchant.vendor_type || "unknown"} | notes=${notes}`;
  });
  return [
    "VENDOR TYPES (id | Arabic | English):",
    ...types,
    "",
    "MERCHANTS (id | name | legacy category | notes):",
    ...rows,
    "",
    "Return the strict JSON array now. Every id must appear with a valid vendor_type_id.",
  ].join("\n");
}

function bestVendorType(merchant: MerchantRow): number {
  const query = `${merchant.name} ${merchant.vendor_type}`;
  let best = VENDOR_TYPE_SEED[0];
  let bestScore = -1;
  for (const vendor of VENDOR_TYPE_SEED) {
    const score = Math.max(
      smartTextScore(query, vendor.name_ar).score,
      smartTextScore(query, vendor.name_en).score,
    );
    if (score > bestScore) {
      best = vendor;
      bestScore = score;
    }
  }
  return best.id;
}

export function coerceForcedMerchants(
  raw: unknown[],
  merchants: MerchantRow[],
): ForcedMerchant[] {
  const byId = new Map(merchants.map((merchant) => [merchant.id, merchant]));
  const valid = new Set(VENDOR_TYPE_SEED.map((vendor) => vendor.id));
  const proposed = new Map<string, { id: number; confidence: number }>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const vendorTypeId = Number(record.vendor_type_id);
    if (byId.has(id) && valid.has(vendorTypeId)) {
      proposed.set(id, {
        id: vendorTypeId,
        confidence: Math.max(0, Math.min(100, Number(record.confidence) || 0)),
      });
    }
  }

  return merchants.map((merchant) => {
    const choice = proposed.get(merchant.id);
    return choice
      ? {
          id: merchant.id,
          vendor_type_id: choice.id,
          confidence: choice.confidence,
          source: "model" as const,
        }
      : {
          id: merchant.id,
          vendor_type_id: bestVendorType(merchant),
          confidence: 60,
          source: "fallback" as const,
        };
  });
}

export { extractJsonArray };
