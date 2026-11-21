import { VARIANT_SEED } from "../../src/lib/taxonomy/data.generated";

import {
  CONFIDENCE_THRESHOLD,
  extractJsonArray,
  normalizeLabel,
} from "./ai-taxonomy-core";

export type LegacyAttribute = {
  variantLabel?: string;
  variantId?: number | null;
  optionIds?: number[];
  [key: string]: unknown;
};

export type VariantProductRow = {
  id: string;
  name: string;
  vendor_type_id: number | null;
  attributes: LegacyAttribute[];
};

export type AttributeMapping = {
  label: string;
  variant_id: number;
  option_id: number;
  confidence: number;
};

export type VariantClassification = {
  id: string;
  mappings: AttributeMapping[];
  confidence: number;
  needs_human_review: boolean;
};

type VariantPair = { variant_id: number; option_id: number };

const VALID_PAIRS = new Set(
  VARIANT_SEED.flatMap((variant) =>
    variant.options.map((option) => `${variant.variant_id}:${option.option_id}`),
  ),
);

const LOCAL_OPTIONS = new Map<string, VariantPair[]>();
for (const variant of VARIANT_SEED) {
  for (const option of variant.options) {
    const keys = [
      option.option_name_ar,
      option.option_name_en,
      ...option.aliases,
    ];
    for (const key of keys) {
      const label = normalizeLabel(key);
      if (!label) continue;
      const bucket = LOCAL_OPTIONS.get(label) ?? [];
      const pair = { variant_id: variant.variant_id, option_id: option.option_id };
      if (!bucket.some((item) => item.variant_id === pair.variant_id && item.option_id === pair.option_id)) {
        bucket.push(pair);
      }
      LOCAL_OPTIONS.set(label, bucket);
    }
  }
}

export function localVariantMapping(label: string | null | undefined): VariantPair | null {
  const matches = LOCAL_OPTIONS.get(normalizeLabel(label)) ?? [];
  return matches.length === 1 ? matches[0] : null;
}

export function needsVariantMapping(row: VariantProductRow): boolean {
  return row.attributes.some(
    (attribute) =>
      typeof attribute.variantLabel === "string" &&
      attribute.variantLabel.trim().length > 0 &&
      (attribute.variantId == null || (attribute.optionIds ?? []).length === 0),
  );
}

export function splitVariantProducts(rows: VariantProductRow[]): {
  local: VariantClassification[];
  pending: VariantProductRow[];
} {
  const local: VariantClassification[] = [];
  const pending: VariantProductRow[] = [];

  for (const row of rows) {
    const mappings: AttributeMapping[] = [];
    let complete = row.attributes.length > 0;
    for (const attribute of row.attributes) {
      const label = String(attribute.variantLabel ?? "").trim();
      const pair = localVariantMapping(label);
      if (!label || !pair) {
        complete = false;
        break;
      }
      mappings.push({ label, ...pair, confidence: 100 });
    }
    if (complete) {
      local.push({
        id: row.id,
        mappings,
        confidence: 100,
        needs_human_review: false,
      });
    } else {
      pending.push(row);
    }
  }
  return { local, pending };
}

export const SYSTEM_PROMPT = `You map legacy product variant labels onto one global variant catalogue for an Egyptian quick-commerce operator.
You receive products with an id, name, vendor type id and legacy attribute labels. Map every label to exactly one variant group + option pair from the catalogue.

Rules:
- Use ONLY the variant_id + option_id pairs listed in the catalogue. Never invent ids.
- The same Arabic label can belong to different groups; use the product name and vendor type as context.
- Prefer the most specific option. If a label is not a reliable match, return null ids and confidence below ${CONFIDENCE_THRESHOLD}.
- confidence is an integer 0-100 per label.
- Return a STRICT JSON array, no prose and no markdown fences:
  [{"id":"<product id>","attributes":[{"label":"<original label>","variant_id":<id or null>,"option_id":<id or null>,"confidence":<0-100>}]}]
- Return exactly one object per input product and one attribute object per supplied label.`;

export function buildUserPrompt(products: VariantProductRow[]): string {
  const catalogue = VARIANT_SEED.flatMap((variant) =>
    variant.options.map((option) => {
      const aliases = option.aliases.length ? ` | aliases=${option.aliases.join(", ")}` : "";
      return `${variant.variant_id} | ${variant.name_ar} | ${option.option_id} | ${option.option_name_ar} | ${option.option_name_en}${aliases}`;
    }),
  );
  const rows = products.map((product) => {
    const labels = [...new Set(
      product.attributes
        .map((attribute) => String(attribute.variantLabel ?? "").trim())
        .filter(Boolean),
    )];
    return `${product.id} | vendor_type_id=${product.vendor_type_id ?? "unknown"} | name=${product.name} | labels=${labels.join(" || ")}`;
  });
  return [
    "VARIANT CATALOGUE (variant_id | group | option_id | Arabic | English | aliases):",
    ...catalogue,
    "",
    "PRODUCTS (id | vendor type | name | legacy labels):",
    ...rows,
    "",
    "Return the strict JSON array now.",
  ].join("\n");
}

export function coerceVariantClassifications(
  raw: unknown[],
  products: VariantProductRow[],
): VariantClassification[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const seen = new Set<string>();
  const out: VariantClassification[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const product = byId.get(id);
    if (!product || seen.has(id)) continue;
    seen.add(id);

    const supplied = Array.isArray(record.attributes) ? record.attributes : [];
    const byLabel = new Map<string, AttributeMapping>();
    for (const item of supplied) {
      if (typeof item !== "object" || item === null) continue;
      const value = item as Record<string, unknown>;
      const label = typeof value.label === "string" ? value.label.trim() : "";
      const variantId = Number(value.variant_id);
      const optionId = Number(value.option_id);
      const confidence = Math.max(0, Math.min(100, Number(value.confidence) || 0));
      if (!label || !VALID_PAIRS.has(`${variantId}:${optionId}`)) continue;
      byLabel.set(label, {
        label,
        variant_id: variantId,
        option_id: optionId,
        confidence,
      });
    }

    const mappings: AttributeMapping[] = [];
    let valid = product.attributes.length > 0;
    for (const attribute of product.attributes) {
      const label = String(attribute.variantLabel ?? "").trim();
      const mapping = byLabel.get(label);
      if (!mapping || mapping.confidence < CONFIDENCE_THRESHOLD) {
        valid = false;
        break;
      }
      mappings.push(mapping);
    }

    const confidence = mappings.length
      ? Math.min(...mappings.map((mapping) => mapping.confidence))
      : 0;
    out.push({
      id,
      mappings,
      confidence,
      needs_human_review: !valid,
    });
  }

  for (const product of products) {
    if (seen.has(product.id)) continue;
    out.push({ id: product.id, mappings: [], confidence: 0, needs_human_review: true });
  }
  return out;
}

export function applyVariantMappings(
  row: VariantProductRow,
  mappings: AttributeMapping[],
): LegacyAttribute[] | null {
  if (mappings.length !== row.attributes.length) return null;
  const byLabel = new Map(mappings.map((mapping) => [mapping.label, mapping]));
  const next = row.attributes.map((attribute) => {
    const label = String(attribute.variantLabel ?? "").trim();
    const mapping = byLabel.get(label);
    if (!mapping) return null;
    return {
      ...attribute,
      variantId: mapping.variant_id,
      optionIds: [mapping.option_id],
    };
  });
  return next.every((attribute) => attribute !== null)
    ? (next as LegacyAttribute[])
    : null;
}

export { extractJsonArray };
