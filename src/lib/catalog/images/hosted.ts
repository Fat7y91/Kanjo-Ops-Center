/**
 * Recognises image references that already live on infrastructure we control.
 *
 * A "hosted" reference needs no mirroring: it is either served by the app's own
 * content-addressed route or by the R2 public domain. Detection is purely
 * structural so it works in the browser (Excel warning) and on the server
 * (mirror endpoint) without importing either runtime.
 */

export const INTERNAL_IMAGE_PATH = "/api/catalog/images/";

/** Absolute http(s) URL or an app-relative path? */
function isAbsolute(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function r2Base(): string {
  const configured =
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim() ||
    process.env.R2_PUBLIC_BASE_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : "";
}

/** True for inline Base64 captures, which still need to be mirrored. */
export function isDataImageUrl(value: string | null | undefined): boolean {
  return /^data:image\//i.test(value?.trim() ?? "");
}

/**
 * True when the value already points at a permanent copy we serve: the internal
 * `/api/catalog/images/<id>` route or the configured R2 public base URL.
 */
export function isHostedImageUrl(value: string | null | undefined): boolean {
  const raw = value?.trim();
  if (!raw || isDataImageUrl(raw)) return false;

  if (raw.startsWith(INTERNAL_IMAGE_PATH)) return true;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.pathname.startsWith(INTERNAL_IMAGE_PATH)) return true;

    const base = r2Base();
    return Boolean(base) && raw.startsWith(`${base}/`);
  } catch {
    return false;
  }
}

/**
 * An external reference that the mirror workflow should copy. Empty values and
 * already-hosted values are excluded.
 */
export function needsMirroring(value: string | null | undefined): boolean {
  const raw = value?.trim();
  if (!raw) return false;
  return !isHostedImageUrl(raw);
}

/** Absolute URL of an external image, or null when the value is not one. */
export function externalImageUrl(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw || !isAbsolute(raw) || isHostedImageUrl(raw)) return null;
  return raw;
}
