/**
 * Resolves a merchant logo into bytes react-pdf can always embed.
 *
 * `@react-pdf/layout` calls `resolveImage` while laying out the document and
 * does not catch a rejected fetch or an undecodable payload: one bad remote
 * logo (a Firebase URL that 404s, times out, or returns HTML/WebP instead of a
 * raster) rejects the whole render and the route answers 500. Fetching here,
 * up front, with a deadline and a byte-signature check, lets the document drop a
 * broken logo and still produce the rest of the contract.
 *
 * Only JPEG and PNG are accepted — the formats react-pdf decodes without a Web
 * Worker, which the Workers runtime refuses to spawn. Anything else degrades to
 * "no logo" rather than a crash.
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

/** Validates an existing data URI and returns it unchanged, or "" when unusable. */
function fromDataUri(uri: string): string {
  const match = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  if (!match) return "";
  return uri;
}

/**
 * Returns a data URI safe for react-pdf, or "" when the source is missing,
 * unreachable, oversized, or not a JPEG/PNG.
 */
export async function resolveLogoDataUri(
  source: string | null | undefined,
): Promise<string> {
  const raw = (source ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return fromDataUri(raw);
  if (!/^https?:\/\//i.test(raw)) return "";

  try {
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
    return "";
  }
}
