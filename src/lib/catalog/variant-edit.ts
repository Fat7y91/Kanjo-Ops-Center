import { normalizeCode } from "./sku";
import type { CatalogVariantSelection } from "./types";

/** One editable variant row as it leaves the form. Prices are major units. */
export type VariantEditDraft = {
  variantId?: number | null;
  optionIds: number[];
  label: string;
  price: number;
  sku: string;
  barcode: string;
  available: boolean;
  imageUrl?: string | null;
};

export type VariantNormalization =
  | {
      ok: true;
      attributes: CatalogVariantSelection[];
      basePrice: number;
    }
  | { ok: false; message: string };

/**
 * Validate and serialise the edited variant set.
 *
 * Per-variant money is stored in minor units inside `attributes`, matching the
 * V1 JSON already in production. The whole set is replaced in one row update,
 * so an invalid row must fail before any write.
 */
export function normalizeVariantDrafts(
  variants: VariantEditDraft[],
): VariantNormalization {
  if (variants.length === 0) {
    return {
      ok: false,
      message: "أضف متغيراً واحداً على الأقل للمنتج المتغير.",
    };
  }

  const attributes: CatalogVariantSelection[] = [];
  for (const [index, variant] of variants.entries()) {
    if (!Number.isFinite(variant.price) || variant.price < 0) {
      return {
        ok: false,
        message: `أدخل سعراً صحيحاً للمتغير رقم ${index + 1}.`,
      };
    }
    const optionIds = variant.optionIds.filter(
      (optionId) => Number.isInteger(optionId) && optionId > 0,
    );
    if (optionIds.length === 0) {
      return {
        ok: false,
        message: `اختر خياراً واحداً على الأقل للمتغير رقم ${index + 1}.`,
      };
    }
    attributes.push({
      variantId: variant.variantId ?? null,
      optionIds,
      variantLabel: variant.label.trim(),
      price_minor: Math.round(variant.price * 100),
      sku: normalizeCode(variant.sku) || null,
      barcode: normalizeCode(variant.barcode) || null,
      available: variant.available,
      ...(variant.imageUrl ? { image_url: variant.imageUrl } : {}),
    });
  }

  return { ok: true, attributes, basePrice: variants[0].price };
}

/** Stable key for a variant row: one option per attribute group. */
export function variantRowKey(
  variantId: number | null | undefined,
  optionIds: number[],
): string {
  const scope = variantId == null ? "x" : String(variantId);
  return optionIds.map((optionId) => `${scope}:${optionId}`).join("|");
}

/** Mutable row state for the product edit table. */
export type EditableVariantRow = {
  id: string;
  variantId: number | null;
  optionIds: number[];
  label: string;
  price: string;
  sku: string;
  barcode: string;
  available: boolean;
};

type VariantTaxonomy = {
  variant_id: number;
  name_ar: string;
  options: {
    option_id: number;
    option_name_ar: string;
  }[];
};

type ProductWithVariants = {
  id: string;
  price: number;
  sku: string;
  barcode: string;
  attributes: CatalogVariantSelection[];
};

function findVariantId(
  variants: VariantTaxonomy[],
  optionId: number | undefined,
): number | null {
  if (optionId === undefined) return null;
  const variant = variants.find((entry) =>
    entry.options.some((option) => option.option_id === optionId),
  );
  return variant?.variant_id ?? null;
}

function describeSelection(
  variants: VariantTaxonomy[],
  variantId: number | null,
  optionIds: number[],
): string {
  const variant = variants.find((entry) => entry.variant_id === variantId);
  const labels = variant
    ? variant.options
        .filter((option) => optionIds.includes(option.option_id))
        .map((option) => `${variant.name_ar}: ${option.option_name_ar}`)
    : variants.flatMap((entry) =>
        entry.options
          .filter((option) => optionIds.includes(option.option_id))
          .map((option) => `${entry.name_ar}: ${option.option_name_ar}`),
      );
  return labels.join(" · ");
}

/** Seed the edit table from the stored V1-compatible variant JSON. */
export function editableRowsFromProduct(
  product: ProductWithVariants,
  variants: VariantTaxonomy[],
): EditableVariantRow[] {
  return product.attributes.map((selection, index) => {
    const variantId =
      selection.variantId ?? findVariantId(variants, selection.optionIds[0]);
    const label =
      selection.variantLabel?.trim() ||
      describeSelection(variants, variantId, selection.optionIds) ||
      `متغير ${index + 1}`;
    return {
      id: `${product.id}-variant-${index}`,
      variantId,
      optionIds: selection.optionIds,
      label,
      price:
        selection.price_minor == null
          ? index === 0
            ? product.price.toFixed(2)
            : ""
          : (selection.price_minor / 100).toFixed(2),
      sku: selection.sku ?? (index === 0 ? product.sku : ""),
      barcode: selection.barcode ?? (index === 0 ? product.barcode : ""),
      available: selection.available ?? true,
    };
  });
}

/** Seed the taxonomy chip state from the stored variant JSON. */
export function selectionsFromProduct(
  product: Pick<ProductWithVariants, "attributes">,
  variants: VariantTaxonomy[],
): Record<number, number[]> {
  const map: Record<number, number[]> = {};
  for (const selection of product.attributes) {
    const variantId =
      selection.variantId ?? findVariantId(variants, selection.optionIds[0]);
    if (variantId == null) continue;
    const current = map[variantId] ?? [];
    map[variantId] = [...new Set([...current, ...selection.optionIds])];
  }
  return map;
}
