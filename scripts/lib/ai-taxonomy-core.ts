/**
 * Pure logic for the AI taxonomy batch classifier.
 *
 * Deliberately free of I/O, Supabase and network imports so it can be unit
 * tested with the repository's TypeScript test loader and reused by any surface
 * that needs to build or validate a classification prompt.
 */

import { VENDOR_TYPE_SEED } from "../../src/lib/taxonomy/data.generated";

/** A mapping at or above this percentage is trusted without human review. */
export const CONFIDENCE_THRESHOLD = 85;

export type TaxonomyNode = {
  id: string;
  parent_id: string | null;
  vendor_type: string;
  name_ar: string;
  name_en: string | null;
  level: number;
};

export type Taxonomy = {
  nodes: TaxonomyNode[];
  byId: Map<string, TaxonomyNode>;
  /** Normalised vendor_type text → the nodes under it. */
  byVendorType: Map<string, TaxonomyNode[]>;
};

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  vendor_type_id: number | null;
  merchants: { vendor_type: string | null; vendor_type_id: number | null } | null;
};

export type Classification = {
  id: string;
  taxonomy_category_id: string | null;
  confidence: number;
  needs_human_review: boolean;
};

/** Strips emoji/symbols so "🍔 مطاعم وكافيهات" and "مطاعم وكافيهات" match. */
export function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

export function parentPath(
  node: TaxonomyNode,
  byId: Map<string, TaxonomyNode>,
): string {
  const parts: string[] = [];
  let cursor: TaxonomyNode | undefined = node;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    parts.unshift(cursor.name_ar || cursor.name_en || cursor.id);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return parts.join(" > ");
}

export function buildTaxonomy(nodes: TaxonomyNode[]): Taxonomy {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byVendorType = new Map<string, TaxonomyNode[]>();
  for (const node of nodes) {
    const key = normalizeLabel(node.vendor_type);
    const bucket = byVendorType.get(key);
    if (bucket) bucket.push(node);
    else byVendorType.set(key, [node]);
  }
  return { nodes, byId, byVendorType };
}

/** Human-readable vendor type labels for a product, most specific first. */
export function vendorCandidates(product: ProductRow): string[] {
  const labels = new Set<string>();
  const merchantLabel = product.merchants?.vendor_type ?? "";
  if (merchantLabel) labels.add(merchantLabel);

  const id = product.vendor_type_id ?? product.merchants?.vendor_type_id ?? null;
  if (id != null) {
    const seed = VENDOR_TYPE_SEED.find((v) => v.id === id);
    if (seed) {
      labels.add(seed.name_ar);
      labels.add(seed.name_en);
    }
  }
  return [...labels].filter((label) => normalizeLabel(label));
}

/**
 * Categories to expose to the model for one product.
 *
 * When the merchant's vendor type resolves to a taxonomy group the candidates
 * are restricted to that group — the single biggest accuracy win, because the
 * same Arabic product name can belong to unrelated verticals. When nothing
 * resolves, the whole tree is offered and the prompt enforces scope.
 */
export function candidateCategories(
  product: ProductRow,
  taxonomy: Taxonomy,
): TaxonomyNode[] {
  const keys = vendorCandidates(product).map(normalizeLabel);
  const matched = new Map<string, TaxonomyNode>();
  for (const key of keys) {
    for (const node of taxonomy.byVendorType.get(key) ?? []) {
      matched.set(node.id, node);
    }
  }
  return matched.size > 0 ? [...matched.values()] : taxonomy.nodes;
}

/**
 * Category ids a single product may legitimately be mapped to.
 *
 * This is per product, not per batch. A batch-level allow-list would accept a
 * restaurant product mapped to a pharmacy category whenever the batch also
 * contained a pharmacy product, so each product gets its own scope here.
 * A product whose vendor type cannot be resolved is allowed the whole tree —
 * the prompt still asks for same-vertical mapping, but we cannot police it.
 */
export function allowedCategoryIds(
  product: ProductRow,
  taxonomy: Taxonomy,
): Set<string> {
  return new Set(candidateCategories(product, taxonomy).map((node) => node.id));
}

export const SYSTEM_PROMPT = `You are a Q-commerce catalog taxonomy expert for an Egyptian quick-commerce operator.
You receive a list of products (each with an id, name, description and vendor type) and a list of the ONLY valid taxonomy categories.
Map every product to exactly one category that belongs to the same vendor type as the product.

Rules:
- Use ONLY category ids from the provided list. Never invent an id.
- Respect vendor-type scope: a Pharmacy product may not be mapped to a Supermarket category, and vice versa.
- Prefer the most specific (deepest) matching category.
- confidence is an integer 0-100 expressing how certain you are.
- If no category is a reasonable fit, set taxonomy_category_id to null and confidence below ${CONFIDENCE_THRESHOLD}.
- Return a STRICT JSON array, no prose and no markdown fences:
  [{"id":"<product id>","taxonomy_category_id":"<uuid or null>","confidence":<0-100>}]
- Return exactly one object per input product, preserving each id.`;

export function buildUserPrompt(
  products: ProductRow[],
  taxonomy: Taxonomy,
  categories: TaxonomyNode[],
): string {
  const categoryLines = categories.map(
    (n) =>
      `${n.id} | vendor_type=${n.vendor_type} | level=${n.level} | ${parentPath(n, taxonomy.byId)} | ar=${n.name_ar} | en=${n.name_en ?? ""}`,
  );
  const productLines = products.map((p) => {
    const vt = vendorCandidates(p)[0] ?? "unknown";
    const desc = (p.description ?? "").replace(/\s+/g, " ").slice(0, 160);
    return `${p.id} | vendor_type=${vt} | name=${p.name} | description=${desc}`;
  });
  return [
    "CATEGORIES (id | vendor_type | level | path | names):",
    ...categoryLines,
    "",
    "PRODUCTS (id | vendor_type | name | description):",
    ...productLines,
    "",
    "Return the strict JSON array now.",
  ].join("\n");
}

/** Parses a model reply, tolerating ```json fences and leading prose. */
export function extractJsonArray(text: string): unknown[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  const candidate = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed: unknown = JSON.parse(candidate);
  if (!Array.isArray(parsed)) throw new Error("Model response was not a JSON array");
  return parsed;
}

/**
 * Validates the model reply against the batch it answered.
 *
 * `allowed` is either one set shared by the batch or a per-product resolver, so
 * a product can never be accepted into a category outside its own vendor type.
 * Rejects hallucinated ids, clamps confidence, and guarantees one result per
 * input product: anything the model dropped is returned as a null that needs
 * review, so a row cannot silently disappear from the run.
 */
export function coerceClassifications(
  raw: unknown[],
  products: ProductRow[],
  allowed: Set<string> | ((product: ProductRow) => Set<string>),
): Classification[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const allowedFor = (product: ProductRow): Set<string> =>
    typeof allowed === "function" ? allowed(product) : allowed;

  const out: Classification[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const product = byId.get(id);
    if (!product || seen.has(id)) continue;
    seen.add(id);

    const confidence = Math.max(0, Math.min(100, Number(record.confidence) || 0));
    const proposed =
      typeof record.taxonomy_category_id === "string"
        ? record.taxonomy_category_id.trim()
        : "";

    const valid = proposed.length > 0 && allowedFor(product).has(proposed);
    out.push({
      id,
      taxonomy_category_id: valid ? proposed : null,
      confidence,
      needs_human_review: !valid || confidence < CONFIDENCE_THRESHOLD,
    });
  }

  for (const product of products) {
    if (seen.has(product.id)) continue;
    out.push({
      id: product.id,
      taxonomy_category_id: null,
      confidence: 0,
      needs_human_review: true,
    });
  }
  return out;
}
