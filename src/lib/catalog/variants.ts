/**
 * Variant matrix algebra.
 *
 * The rep only picks option chips; everything else — the Cartesian product of
 * the selected options, the readable row name and the deterministic row SKU —
 * is derived here so the UI and the save payload can never drift apart.
 */

import { buildSeededSku } from "@/lib/catalog/sku";
import type { CatalogVariantSelection } from "@/lib/catalog/types";
import type { TaxonomyVariant } from "@/lib/taxonomy/types";

export type VariantCombination = {
  key: string;
  label: string;
  /** Attribute ids in the same order as `label` parts. */
  selections: CatalogVariantSelection[];
};

/** Upper bound that keeps the matrix usable on a phone screen. */
export const MAX_VARIANT_COMBINATIONS = 60;

type BuildArgs = {
  attributes: Record<number, number[]>;
  variants: TaxonomyVariant[];
};

/**
 * Cartesian product of every non-empty attribute group, ordered by the
 * taxonomy's own variant order. Returns `[]` when no option is selected.
 */
export function buildVariantCombinations({
  attributes,
  variants,
}: BuildArgs): VariantCombination[] {
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
