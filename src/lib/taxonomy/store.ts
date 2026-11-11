/**
 * Public entry point for the taxonomy package.
 *
 * The implementation is split by responsibility so no file drifts toward the
 * size limit: `store-state.ts` owns the shared maps, `catalog.ts` the read
 * model, and `requests.ts` the queue and its write paths. This barrel keeps
 * every existing `@/lib/taxonomy/store` import working unchanged.
 */

export { TaxonomyError } from "@/lib/taxonomy/errors";
export type { TaxonomySnapshot } from "@/lib/taxonomy/store-state";
export { taxonomyRevision } from "@/lib/taxonomy/store-state";
export {
  assertCategoryInVendor,
  assertVendorTypeExists,
  findVendorTypeByName,
  getCategory,
  getVendorType,
  listCategories,
  listVariants,
  listVendorTypes,
  taxonomySnapshot,
} from "@/lib/taxonomy/catalog";
export {
  createTaxonomyRequest,
  getTaxonomyRequest,
  listTaxonomyRequests,
  pendingTaxonomyRequestCount,
  type TaxonomyRequestActor,
  type TaxonomyRequestInput,
} from "@/lib/taxonomy/requests";
export {
  createTaxonomyEntry,
  type TaxonomyDirectInput,
} from "@/lib/taxonomy/entries";
export {
  approveTaxonomyRequest,
  rejectTaxonomyRequest,
  type TaxonomyDecisionActor,
} from "@/lib/taxonomy/decisions";
