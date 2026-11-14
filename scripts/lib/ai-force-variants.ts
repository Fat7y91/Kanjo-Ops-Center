import { VARIANT_SEED } from "../../src/lib/taxonomy/data.generated";
import { smartTextScore } from "../../src/lib/search/normalize";

import { extractJsonArray, normalizeLabel } from "./ai-taxonomy-core";
import type {
  AttributeMapping,
  LegacyAttribute,
  VariantProductRow,
} from "./ai-taxonomy-variants";

export type ForcedVariant = {
  id: string;
  mappings: AttributeMapping[];
  source: "model" | "fallback" | "mixed";
};

type VariantPair = { variant_id: number; option_id: number };

const VALID_PAIRS = new Set(
  VARIANT_SEED.flatMap((variant) =>
    variant.options.map((option) => `${variant.variant_id}:${option.option_id}`),
  ),
);

const OPTION_TEXT = VARIANT_SEED.flatMap((variant) =>
  variant.options.map((option) => ({
    variant_id: variant.variant_id,
    option_id: option.option_id,
    text: [
      option.option_name_ar,
      option.option_name_en,
      variant.name_ar,
      variant.name_en,
      ...option.aliases,
    ].join(" "),
  })),
);

const PATTERNS: Array<[string, VariantPair]> = [
  ["نص كيلو", { variant_id: 6, option_id: 26 }],
  ["ربع كيلو", { variant_id: 6, option_id: 25 }],
  ["تمن كيلو", { variant_id: 6, option_id: 24 }],
  ["ثمن كيلو", { variant_id: 6, option_id: 24 }],
  ["اكس لارج", { variant_id: 1, option_id: 51 }],
  ["دبل لارج", { variant_id: 1, option_id: 56 }],
  ["جامبو", { variant_id: 1, option_id: 4 }],
  ["صاروخ", { variant_id: 1, option_id: 5 }],
  ["عائلي", { variant_id: 1, option_id: 49 }],
  ["سنجل", { variant_id: 1, option_id: 48 }],
  ["دبل", { variant_id: 1, option_id: 50 }],
  ["دوبل", { variant_id: 1, option_id: 50 }],
  ["تريبل", { variant_id: 1, option_id: 70 }],
  ["كيلو", { variant_id: 6, option_id: 28 }],
  ["ستاندرد", { variant_id: 1, option_id: 2 }],
  ["صغير", { variant_id: 1, option_id: 1 }],
  ["وسط", { variant_id: 1, option_id: 2 }],
  ["كبير", { variant_id: 1, option_id: 3 }],
  ["شرقي", { variant_id: 1, option_id: 6 }],
  ["شرقى", { variant_id: 1, option_id: 6 }],
  ["فينو", { variant_id: 3, option_id: 10 }],
  ["سوري", { variant_id: 3, option_id: 9 }],
  ["سورى", { variant_id: 3, option_id: 9 }],
  ["بلدي", { variant_id: 3, option_id: 44 }],
  ["فرنساوي", { variant_id: 3, option_id: 45 }],
  ["كيزر", { variant_id: 3, option_id: 46 }],
  ["حار", { variant_id: 2, option_id: 8 }],
  ["عاديه", { variant_id: 2, option_id: 7 }],
  ["عادي", { variant_id: 2, option_id: 7 }],
  ["مشكل", { variant_id: 5, option_id: 17 }],
  ["بندق", { variant_id: 5, option_id: 22 }],
];
PATTERNS.sort((left, right) => right[0].length - left[0].length);

function numberOption(value: number, unit: "gram" | "ml"): VariantPair {
  if (unit === "gram") {
    if (value < 250) return { variant_id: 6, option_id: 23 };
    if (value < 500) return { variant_id: 6, option_id: 25 };
    if (value < 750) return { variant_id: 6, option_id: 26 };
    if (value < 1000) return { variant_id: 6, option_id: 27 };
    return { variant_id: 6, option_id: 28 };
  }
  const buckets: Array<[number, number]> = [
    [10, 29], [20, 30], [30, 31], [40, 32], [50, 33],
    [60, 34], [70, 35], [80, 36], [90, 37], [100, 38],
  ];
  const closest = buckets.reduce((best, current) =>
    Math.abs(current[0] - value) < Math.abs(best[0] - value) ? current : best,
  );
  return { variant_id: 7, option_id: closest[1] };
}

export function fallbackVariantPair(label: string): VariantPair {
  const normalized = normalizeLabel(label);
  for (const [needle, pair] of PATTERNS) {
    if (normalized.includes(normalizeLabel(needle))) return pair;
  }
  const gram = normalized.match(/(\d+)\s*(جرام|جم|g)/);
  if (gram) return numberOption(Number(gram[1]), "gram");
  const ml = normalized.match(/(\d+)\s*(ملل|مل|ml)/);
  if (ml) return numberOption(Number(ml[1]), "ml");

  let best = OPTION_TEXT[0];
  let bestScore = -1;
  for (const option of OPTION_TEXT) {
    const score = smartTextScore(normalized, option.text).score;
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return bestScore > 0
    ? { variant_id: best.variant_id, option_id: best.option_id }
    : { variant_id: 1, option_id: 2 };
}

export const FORCE_VARIANT_PROMPT = `You are the FINAL variant standardization decision-maker for an Egyptian quick-commerce operator.
Every legacy attribute label MUST be mapped to exactly one global variant_id + option_id pair. Manual review is not allowed.

Think step by step internally about the product name, vendor type, and each legacy label. Then output only the decisions.

Rules:
- Use ONLY variant_id + option_id pairs from the supplied catalogue. Never invent ids.
- Pick the closest option by meaning, size, weight, count, package volume, taste, bread, sauce or dough context.
- Numeric labels such as 500 جرام or 100ملل must map to the nearest catalogue option, not be dropped.
- Every supplied label must have a non-null variant_id and option_id.
- confidence is an integer 0-100. You still choose the closest match when confidence is low.
- Return a STRICT JSON array, no prose and no markdown fences:
  [{"id":"<product id>","attributes":[{"label":"<original label>","variant_id":<id>,"option_id":<id>,"confidence":<0-100>}]}]
- Return exactly one object per input product and one attribute object per supplied label.`;

export function buildForceVariantPrompt(products: VariantProductRow[]): string {
  const catalogue = VARIANT_SEED.flatMap((variant) =>
    variant.options.map((option) => {
      const aliases = option.aliases.length ? ` | aliases=${option.aliases.join(", ")}` : "";
      return `${variant.variant_id} | ${variant.name_ar} | ${option.option_id} | ${option.option_name_ar} | ${option.option_name_en}${aliases}`;
    }),
  );
  const rows = products.map((product) => {
    const labels = product.attributes
      .map((attribute) => String(attribute.variantLabel ?? "").trim())
      .filter(Boolean);
    return `${product.id} | vendor_type_id=${product.vendor_type_id ?? "unknown"} | name=${product.name} | labels=${labels.join(" || ")}`;
  });
  return [
    "VARIANT CATALOGUE (variant_id | group | option_id | Arabic | English | aliases):",
    ...catalogue,
    "",
    "PRODUCTS (id | vendor type | name | legacy labels):",
    ...rows,
    "",
    "Return the strict JSON array now. Every label must have a valid pair.",
  ].join("\n");
}

export function coerceForcedVariants(
  raw: unknown[],
  products: VariantProductRow[],
): ForcedVariant[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const proposed = new Map<string, Map<string, AttributeMapping>>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (!byId.has(id) || !Array.isArray(record.attributes)) continue;
    const byLabel = new Map<string, AttributeMapping>();
    for (const item of record.attributes) {
      if (typeof item !== "object" || item === null) continue;
      const value = item as Record<string, unknown>;
      const label = typeof value.label === "string" ? value.label.trim() : "";
      const variantId = Number(value.variant_id);
      const optionId = Number(value.option_id);
      if (!label || !VALID_PAIRS.has(`${variantId}:${optionId}`)) continue;
      byLabel.set(label, {
        label,
        variant_id: variantId,
        option_id: optionId,
        confidence: Math.max(0, Math.min(100, Number(value.confidence) || 0)),
      });
    }
    proposed.set(id, byLabel);
  }

  return products.map((product) => {
    const byLabel = proposed.get(product.id) ?? new Map<string, AttributeMapping>();
    let modelCount = 0;
    const mappings: AttributeMapping[] = product.attributes.map((attribute) => {
      const label = String(attribute.variantLabel ?? "").trim();
      const choice = byLabel.get(label);
      if (choice) {
        modelCount += 1;
        return choice;
      }
      return { label, ...fallbackVariantPair(label), confidence: 60 };
    });
    return {
      id: product.id,
      mappings,
      source:
        modelCount === mappings.length
          ? "model"
          : modelCount === 0
            ? "fallback"
            : "mixed",
    };
  });
}

export function forceApplyVariantMappings(
  row: VariantProductRow,
  mappings: AttributeMapping[],
): LegacyAttribute[] {
  return row.attributes.map((attribute, index) => ({
    ...attribute,
    variantId: mappings[index].variant_id,
    optionIds: [mappings[index].option_id],
  }));
}

export { extractJsonArray };
