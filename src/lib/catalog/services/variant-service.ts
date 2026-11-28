/**
 * Variant business service (Tier 3).
 *
 * Pure domain algebra for the Smart Variant Matrix: the Cartesian product of
 * the rep's selected options, the derived Arabic row name and the deterministic
 * row SKU. This module has zero React, browser or IndexedDB dependencies so it
 * can be unit-tested and reused by any transport.
 */

import { buildSeededSku } from "@/lib/catalog/sku";
import type { CatalogVariantSelection } from "@/lib/catalog/types";
import type { TaxonomyVariant } from "@/lib/taxonomy/types";

/** Upper bound that keeps the matrix usable on a phone screen. */
export const MAX_VARIANT_COMBINATIONS = 60;

export type VariantCombination = {
  key: string;
  label: string;
  /** Attribute ids in the same order as `label` parts. */
  selections: CatalogVariantSelection[];
};

export type HydratedVariantCombination = VariantCombination & {
  /** Final Arabic name: base name + option labels. */
  name: string;
  /** Deterministic SKU so the matrix row and the queued draft agree. */
  sku: string;
  /** Parsed price, or `null` when the rep has not typed a valid one yet. */
  price: number | null;
};

export type FinalVariantProduct = {
  name: string;
  sku: string;
  price: number;
  attributes: CatalogVariantSelection[];
};

export class VariantError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VariantError";
    this.code = code;
  }
}

type GenerateArgs = {
  attributes: Record<number, number[]>;
  variants: TaxonomyVariant[];
};

/**
 * Cartesian product of every non-empty attribute group, ordered by the
 * taxonomy's own variant order. Returns `[]` when no option is selected.
 */
export function generateVariantMatrix({
  attributes,
  variants,
}: GenerateArgs): VariantCombination[] {
  const groups = variants
    .map((variant) => {
      const optionIds = attributes[variant.variant_id] ?? [];
      const options = variant.options.filter((option) =>
        optionIds.includes(option.option_id),
      );
      return {
        variantId: variant.variant_id,
        variantName: variant.name_ar,
        options,
      };
    })
    .filter((group) => group.options.length > 0);

  if (groups.length === 0) return [];

  let combinations: Array<{
    labels: string[];
    selections: CatalogVariantSelection[];
  }> = [{ labels: [], selections: [] }];

  for (const group of groups) {
    const next: typeof combinations = [];
    for (const combination of combinations) {
      for (const option of group.options) {
        next.push({
          labels: [...combination.labels, option.option_name_ar],
          selections: [
            ...combination.selections,
            { variantId: group.variantId, optionIds: [option.option_id] },
          ],
        });
        if (next.length >= MAX_VARIANT_COMBINATIONS) break;
      }
      if (next.length >= MAX_VARIANT_COMBINATIONS) break;
    }
    combinations = next;
  }

  return combinations.map((combination) => ({
    key: combination.selections
      .map((selection) => `${selection.variantId}:${selection.optionIds[0]}`)
      .join("|"),
    label: combination.labels.join(" - "),
    selections: combination.selections,
  }));
}

/** Human labels of the attribute groups the rep actually selected. */
export function selectedAttributeLabels(
  attributes: Record<number, number[]>,
  variants: TaxonomyVariant[],
): string[] {
  return variants
    .filter((variant) => (attributes[variant.variant_id] ?? []).length > 0)
    .map((variant) => variant.name_ar);
}

/**
 * Full product name for a combination: base name plus the option labels, e.g.
 * "شاورما فراخ - كبير - حار".
 */
export function combinationName(baseName: string, label: string): string {
  const base = baseName.trim();
  if (!label) return base;
  return base ? `${base} - ${label}` : label;
}

/**
 * Deterministic row SKU so the code shown in the matrix is the code queued.
 * `index` is the combination position inside the matrix.
 */
export function combinationSku(
  vendorTypeId: number | null | undefined,
  seed: string,
  index: number,
): string {
  return buildSeededSku(vendorTypeId, seed, index);
}

function parsePrice(raw: string | undefined): number | null {
  if (raw === undefined || !raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

type HydrateArgs = {
  baseName: string;
  vendorTypeId: number | null;
  skuSeed: string;
  combinations: VariantCombination[];
  /** Raw price strings keyed by `VariantCombination.key`. */
  prices?: Record<string, string>;
};

/**
 * Attaches the final Arabic name, deterministic SKU and parsed price to every
 * combination. Invalid or missing prices surface as `null`; strict validation
 * happens in `finalizeVariantProducts` so the matrix can render while the rep
 * is still typing.
 */
export function hydrateVariantCombinations({
  baseName,
  vendorTypeId,
  skuSeed,
  combinations,
  prices = {},
}: HydrateArgs): HydratedVariantCombination[] {
  return combinations.map((combination, index) => ({
    ...combination,
    name: combinationName(baseName, combination.label),
    sku: combinationSku(vendorTypeId, skuSeed, index),
    price: parsePrice(prices[combination.key]),
  }));
}

type FinalizeArgs = {
  baseName: string;
  vendorTypeId: number | null;
  skuSeed: string;
  combinations: VariantCombination[];
  prices: Record<string, string>;
};

/**
 * Strict save-time finalisation: every combination must carry a valid price
 * before any draft is queued. Throws a typed error the controller maps to a
 * rep-facing message.
 */
export function finalizeVariantProducts({
  baseName,
  vendorTypeId,
  skuSeed,
  combinations,
  prices,
}: FinalizeArgs): FinalVariantProduct[] {
  const hydrated = hydrateVariantCombinations({
    baseName,
    vendorTypeId,
    skuSeed,
    combinations,
    prices,
  });

  return hydrated.map((row) => {
    if (row.price === null) {
      throw new VariantError(
        "VARIANT_PRICE_REQUIRED",
        `أدخل سعراً صحيحاً لكل تركيبة — الناقص: ${row.name || "تركيبة"}.`,
      );
    }
    return {
      name: row.name,
      sku: row.sku,
      price: row.price,
      attributes: row.selections,
    };
  });
}
