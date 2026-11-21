/**
 * Content hashing for the mirror workflow.
 *
 * Keys are derived from the *source* reference rather than the downloaded bytes
 * so re-running a batch is idempotent even when the upstream server sends a new
 * ETag or re-encodes the same picture.
 */

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Lowercase SHA-256 hex digest of a string or raw bytes. */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? encoder.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}
