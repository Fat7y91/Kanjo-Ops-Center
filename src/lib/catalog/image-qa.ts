/**
 * Deprecated alias — image QA rules now live in the Tier 3 service.
 *
 * Kept as a re-export so the catalog store and API error mapper resolve to one
 * implementation. New code must import from `services/image-qa-service`.
 */

export {
  ImageQaError,
  applyImageQa,
  type ImageQaPatch,
} from "@/lib/catalog/services/image-qa-service";
