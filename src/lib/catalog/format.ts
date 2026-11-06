const CURRENCY = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return CURRENCY.format(value);
}

const DRIVE_HOSTS = new Set([
  "drive.google.com",
  "drive.usercontent.google.com",
  "docs.google.com",
]);

/**
 * Returns the Google Drive file id held by a V1/V2 image reference.
 *
 * V1 stored several URL shapes (`uc?export=view&id=…`, `thumbnail?id=…`,
 * `file/d/<id>/view`) and sometimes a bare id.
 */
export function driveFileId(value: string): string {
  const match =
    value.match(/[?&]id=([^&]+)/) ?? value.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
  return "";
}

/**
 * Rewrites a Google Drive image reference into a form browsers can embed.
 *
 * `uc?export=view` 303-redirects to `drive.usercontent.google.com`, which
 * answers with `cross-origin-resource-policy: same-site`; Chrome therefore
 * blocks it inside a cross-origin `<img>` and the thumbnail renders broken.
 * `lh3.googleusercontent.com/d/<id>` serves the same bytes with no such
 * header. Any non-Drive reference (data URL, Supabase Storage, relative path)
 * is returned untouched.
 */
export function resolveDisplayImageUrl(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^data:/i.test(raw)) return raw;

  const host = hostOf(raw);
  if (host === "lh3.googleusercontent.com") return raw;
  if (host && !DRIVE_HOSTS.has(host)) return raw;

  const id = driveFileId(raw);
  if (!id) return raw;
  return `https://lh3.googleusercontent.com/d/${id}=w1600`;
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const DRIVE_IMAGE_URL =
  /^https:\/\/(?:lh3\.googleusercontent\.com|drive\.google\.com|drive\.usercontent\.google\.com)\//i;

/**
 * Same-origin proxy path for a Drive image, or null when proxying does not
 * apply.
 *
 * Some operator networks (and locked-down browsers) cannot reach Google at all,
 * so the direct `lh3` request fails even though the app server can fetch it.
 * Routing the bytes through `/api/image` makes the `<img>` talk only to the
 * app's own origin. Non-Drive references are left alone.
 */
export function proxyImageUrl(value: string | null | undefined): string | null {
  const direct = resolveDisplayImageUrl(value);
  if (!direct || !DRIVE_IMAGE_URL.test(direct)) return null;
  return `/api/image?url=${encodeURIComponent(direct)}`;
}
