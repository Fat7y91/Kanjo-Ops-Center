"use client";

import { useMemo } from "react";

import {
  MAX_VARIANT_COMBINATIONS,
  generateVariantMatrix,
  hydrateVariantCombinations,
  selectedAttributeLabels,
} from "@/lib/catalog/services/variant-service";
import type { TaxonomyVariant } from "@/lib/taxonomy/types";

type UseVariantMatrixArgs = {
  enabled: boolean;
  baseName: string;
  attributes: Record<number, number[]>;
  prices: Record<string, string>;
  skuSeed: string;
  vendorTypeId: number | null;
  variants: TaxonomyVariant[];
};

/**
 * Controller glue for the variant matrix.
 *
 * Owns the derivation pipeline (matrix → hydrated rows) and delegates every
 * rule to the Tier 3 service, so the presentational grid receives display-ready
 * data and the form only has to forward price edits.
 */
export function useVariantMatrix({
  enabled,
  baseName,
  attributes,
  prices,
  skuSeed,
  vendorTypeId,
  variants,
}: UseVariantMatrixArgs) {
  const combinations = useMemo(
    () =>
      enabled ? generateVariantMatrix({ attributes, variants }) : [],
    [enabled, attributes, variants],
  );

  const rows = useMemo(
    () =>
      hydrateVariantCombinations({
        baseName,
        vendorTypeId,
        skuSeed,
        combinations,
        prices,
      }),
    [baseName, vendorTypeId, skuSeed, combinations, prices],
  );

  const selectedAttributes = useMemo(
    () => (enabled ? selectedAttributeLabels(attributes, variants) : []),
    [enabled, attributes, variants],
  );

  return {
    combinations,
    rows,
    selectedAttributes,
    limit: MAX_VARIANT_COMBINATIONS,
  };
}
