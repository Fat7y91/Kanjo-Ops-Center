/**
 * Deprecated alias — variant algebra now lives in the Tier 3 service.
 *
 * Kept as a thin re-export so older imports resolve to the single source of
 * truth in `services/variant-service.ts`. New code must import from the
 * service directly.
 */

export {
  MAX_VARIANT_COMBINATIONS,
  combinationName,
  combinationSku,
  generateVariantMatrix as buildVariantCombinations,
  type VariantCombination,
} from "@/lib/catalog/services/variant-service";
