/**
 * Resolves a merchant logo into a data URI the PDF engine can always embed.
 *
 * A bad logo (a Firebase URL that 404s, times out, returns WebP/HTML, or a
 * corrupt data URI) would otherwise break the render: the route would answer
 * 500 instead of printing the contract. Web images (`<img>` in the UI) tolerate
 * all of this in the browser, but the PDF engine only embeds well-formed
 * JPEG/PNG buffers.
 *
 * This module therefore never throws: every failure is swallowed and reported as
 * an empty string ("no logo"). The contract must still print without the
 * merchant mark rather than fail.
 *
 * Only JPEG and PNG are accepted — the formats `pdf-lib` can embed directly with
 * no image transcoding step.
 */

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 4000;

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((value, index) => bytes[index] === value);
}

/** Sniffs the raster format from the leading bytes; null when unsupported. */
export function sniffRasterFormat(bytes: Uint8Array): "jpeg" | "png" | null {
  if (startsWith(bytes, JPEG_MAGIC)) return "jpeg";
  if (startsWith(bytes, PNG_MAGIC)) return "png";
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Validates a data URI by decoding and byte-sniffing it, then re-encodes a clean
 * URI. A regex-only check would let a corrupt payload (e.g. `notvalid`) through
 * to the embedder, which throws while decoding. Returns "" when unusable.
 */
function fromDataUri(uri: string): string {
  const match = /^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/i.exec(uri);
  if (!match) return "";
  const bytes = fromBase64(match[1]!.replace(/\s+/g, ""));
  if (!bytes || bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return "";
  const format = sniffRasterFormat(bytes);
  if (!format) return "";
  return `data:image/${format};base64,${toBase64(bytes)}`;
}

/**
 * Returns a data URI safe for the PDF engine, or "" when the source is missing,
 * unreachable, oversized, or not a well-formed JPEG/PNG. Never throws.
 */
export async function resolveLogoDataUri(
  source: string | null | undefined,
): Promise<string> {
  try {
    const raw = (source ?? "").trim();
    if (!raw) return "";
    if (raw.startsWith("data:image/")) return fromDataUri(raw);
    if (!/^https?:\/\//i.test(raw)) return "";

    const response = await fetch(raw, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return "";
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > MAX_LOGO_BYTES) return "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return "";
    const format = sniffRasterFormat(bytes);
    if (!format) return "";
    return `data:image/${format};base64,${toBase64(bytes)}`;
  } catch {
    // Any transport/decode failure: drop the logo, keep the contract printable.
    return "";
  }
}
