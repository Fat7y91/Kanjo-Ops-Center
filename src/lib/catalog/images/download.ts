/**
 * Best-effort downloader for external product images.
 *
 * Marketplace CDNs commonly reject requests that do not look like a browser,
 * require a `Referer`, or answer with a format we cannot store (`avif`, `svg`)
 * or a multi-megabyte original. The pipeline tries a browser-shaped request,
 * then the same request with the origin as `Referer`, then a resizing JPEG
 * proxy. Anything larger than the target, and every PNG/BMP/AVIF, is normalised
 * through the proxy before it can reach R2 or the internal blob store.
 *
 * `fetch` is injectable so the fallbacks are unit tested without network access.
 */

export const IMAGE_MIN_BYTES = 500;
/** Raw files under this size can be stored as-is when they are already JPEG. */
export const IMAGE_TARGET_BYTES = 400 * 1024;
/** Hard ceiling for anything this pipeline persists. */
export const IMAGE_MAX_BYTES = 1024 * 1024;
/** A 800px JPEG above this gets one smaller retry. */
export const IMAGE_RETRY_BYTES = 500 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 10_000;

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ACCEPT = "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8";
const ACCEPT_LANGUAGE = "ar,en;q=0.9";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type DownloadVia = "direct" | "referer" | "proxy";

export type DownloadResult =
  | {
      ok: true;
      bytes: Uint8Array;
      contentType: string;
      via: DownloadVia;
    }
  | { ok: false; reason: string };

type ResizeVariant = { width: number; height: number; quality: number };

const PRIMARY_VARIANT: ResizeVariant = { width: 800, height: 800, quality: 82 };
const COMPACT_VARIANT: ResizeVariant = { width: 600, height: 600, quality: 75 };

type Attempt = {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: Uint8Array | null;
};

function contentTypeOf(response: Response): string {
  return (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

async function attempt(
  fetchImpl: FetchLike,
  url: string,
  referer?: string,
): Promise<Attempt> {
  const headers: Record<string, string> = {
    "User-Agent": CHROME_UA,
    Accept: ACCEPT,
    "Accept-Language": ACCEPT_LANGUAGE,
  };
  if (referer) headers.Referer = referer;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = contentTypeOf(response);
    if (!response.ok) {
      return { ok: false, status: response.status, contentType, bytes: null };
    }
    const buffer = await response.arrayBuffer();
    return {
      ok: true,
      status: response.status,
      contentType,
      bytes: new Uint8Array(buffer),
    };
  } catch {
    return { ok: false, status: 0, contentType: "", bytes: null };
  } finally {
    clearTimeout(timer);
  }
}

function sizeInRange(bytes: Uint8Array | null, maxBytes: number): boolean {
  return Boolean(
    bytes &&
      bytes.byteLength >= IMAGE_MIN_BYTES &&
      bytes.byteLength <= maxBytes,
  );
}

function isImageWithin(attempted: Attempt, maxBytes: number): boolean {
  return (
    attempted.ok &&
    attempted.contentType.startsWith("image/") &&
    sizeInRange(attempted.bytes, maxBytes)
  );
}

/** Already JPEG and under the raw target: no proxy needed. */
function isServableJpeg(attempted: Attempt): boolean {
  return (
    isImageWithin(attempted, IMAGE_TARGET_BYTES) &&
    attempted.contentType === "image/jpeg"
  );
}

/** Last-resort origin file when the proxy is unavailable, still under 1 MB. */
function isServableFallback(attempted: Attempt): boolean {
  return (
    isImageWithin(attempted, IMAGE_MAX_BYTES) &&
    ALLOWED_TYPES.has(attempted.contentType)
  );
}

function originOf(url: string): string {
  try {
    return `${new URL(url).origin}/`;
  } catch {
    return "";
  }
}

/** wsrv.nl resize + JPEG normalisation. `we` never enlarges a small source. */
export function resizeImageUrl(
  url: string,
  variant: ResizeVariant = PRIMARY_VARIANT,
): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${variant.width}&h=${variant.height}&fit=inside&we&output=jpg&q=${variant.quality}`;
}

export function proxyImageUrl(url: string): string {
  return resizeImageUrl(url);
}

function succeed(attempted: Attempt, via: DownloadVia): DownloadResult {
  // The predicates above already proved bytes and type are present.
  return {
    ok: true,
    bytes: attempted.bytes as Uint8Array,
    contentType: attempted.contentType,
    via,
  };
}

/** Downloads an external image, always returning a bounded JPEG when possible. */
export async function downloadImage(
  url: string,
  options: { fetchImpl?: FetchLike } = {},
): Promise<DownloadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const direct = await attempt(fetchImpl, url);
  if (isServableJpeg(direct)) return succeed(direct, "direct");

  let referred: Attempt | null = null;
  const referer = originOf(url);
  if (referer) {
    referred = await attempt(fetchImpl, url, referer);
    if (isServableJpeg(referred)) return succeed(referred, "referer");
  }

  const rawCandidates = [direct, referred];
  const rawBlocked = rawCandidates.some(
    (candidate) =>
      candidate && (candidate.status === 403 || candidate.status === 406),
  );

  /* Oversized files and PNG/BMP/AVIF go through wsrv at 800x800/q82. */
  const normalized = await attempt(fetchImpl, proxyImageUrl(url));
  const normalizedFits = isImageWithin(normalized, IMAGE_MAX_BYTES);
  const normalizedBytes = normalized.bytes?.byteLength ?? 0;
  const shouldRetrySmaller =
    !normalizedFits ||
    (normalized.contentType === "image/jpeg" &&
      normalizedBytes > IMAGE_RETRY_BYTES);

  if (shouldRetrySmaller) {
    const compact = await attempt(
      fetchImpl,
      resizeImageUrl(url, COMPACT_VARIANT),
    );
    if (isImageWithin(compact, IMAGE_MAX_BYTES)) {
      return succeed(compact, "proxy");
    }
  }
  if (normalizedFits) return succeed(normalized, "proxy");

  // Proxy unavailable: a small WebP/PNG from the origin is still bounded.
  if (isServableFallback(direct)) return succeed(direct, "direct");
  if (referred && isServableFallback(referred)) {
    return succeed(referred, "referer");
  }

  if (
    rawBlocked ||
    normalized.status === 403 ||
    normalized.status === 406
  ) {
    return {
      ok: false,
      reason:
        "مصدر الصورة يمنع التنزيل من السيرفر. استبدل الصورة أو أعد المحاولة لاحقاً.",
    };
  }

  const sawImage = [direct, referred, normalized].some(
    (candidate) => candidate && candidate.contentType.startsWith("image/"),
  );
  return {
    ok: false,
    reason: sawImage
      ? "نوع الصورة أو حجمها غير مدعوم."
      : "تعذر تنزيل الصورة من المصدر.",
  };
}
