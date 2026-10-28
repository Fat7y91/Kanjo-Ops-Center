/**
 * SKU + barcode generation.
 *
 * SKUs must be unique even when two reps create the same product name in the
 * same second while offline, so randomness comes from `crypto.getRandomValues`
 * (not `Math.random`) and the result is namespaced by the vendor type.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SKU_BODY_LENGTH = 8;

function randomChars(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let output = "";
  for (const byte of bytes) {
    output += ALPHABET[byte % ALPHABET.length];
  }
  return output;
}

function skuScope(vendorTypeId?: number | null): string {
  return vendorTypeId === undefined || vendorTypeId === null
    ? "XX"
    : String(vendorTypeId).padStart(2, "0");
}

/**
 * Human-readable SKU: `KJ-<vendorType>-<8 chars>`, e.g. `KJ-03-7KQ2M9XT`.
 * Vendor type is embedded so warehouse staff can eyeball the category.
 */
export function generateSku(vendorTypeId?: number | null): string {
  return `KJ-${skuScope(vendorTypeId)}-${randomChars(SKU_BODY_LENGTH)}`;
}

/** Stable prefix for a form session so every variant row shares one family. */
export function createSkuSeed(length = 6): string {
  return randomChars(length);
}

/**
 * Deterministic SKU for one variant combination. The rep sees these codes in
 * the matrix before saving, so the queue and the matrix can never disagree.
 */
export function buildSeededSku(
  vendorTypeId: number | null | undefined,
  seed: string,
  index: number,
): string {
  const suffix = index.toString(36).toUpperCase().padStart(2, "0");
  return `KJ-${skuScope(vendorTypeId)}-${seed}${suffix}`;
}

/**
 * Offline-safe client id used to deduplicate queued drafts and make replays
 * idempotent. Falls back to a timestamp+yarn string when `randomUUID` is
 * missing (older WebViews).
 */
export function createClientId(prefix = "prod"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${randomChars(10).toLowerCase()}`;
}

/** Normalises a rep-typed barcode / SKU: trims and uppercases alphanumerics. */
export function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** Loose EAN/UPC validation: digits only, 8-14 chars. Empty is always valid. */
export function isValidBarcode(value: string): boolean {
  const code = normalizeCode(value);
  if (!code) return true;
  return /^\d{8,14}$/.test(code);
}
