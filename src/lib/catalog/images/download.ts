/**
 * Best-effort downloader for external product images.
 *
 * Marketplace CDNs commonly reject requests that do not look like a browser,
 * require a `Referer`, or answer with a format we cannot store (`avif`, `svg`).
 * The pipeline tries a browser-shaped request, then the same request with the
 * origin as `Referer`, then a JPEG-normalising public proxy. `fetch` is
 * injectable so the fallbacks are unit tested without network access.
 */

export const IMAGE_MIN_BYTES = 500;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
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

function sizeInRange(bytes: Uint8Array | null): boolean {
  return Boolean(
    bytes &&
      bytes.byteLength >= IMAGE_MIN_BYTES &&
      bytes.byteLength <= IMAGE_MAX_BYTES,
  );
}

function isImage(attempted: Attempt): boolean {
  return (
    attempted.ok &&
    attempted.contentType.startsWith("image/") &&
    sizeInRange(attempted.bytes)
  );
}

/** JPEG/PNG upload as-is; anything else is normalised through the proxy. */
function isPreferred(attempted: Attempt): boolean {
  return (
    isImage(attempted) &&
    (attempted.contentType === "image/jpeg" ||
      attempted.contentType === "image/png")
  );
}

function isAllowed(attempted: Attempt): boolean {
  return isImage(attempted) && ALLOWED_TYPES.has(attempted.contentType);
}

function originOf(url: string): string {
  try {
    return `${new URL(url).origin}/`;
  } catch {
    return "";
  }
}

export function proxyImageUrl(url: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=85&n=-1`;
}

function succeed(attempted: Attempt, via: DownloadVia): DownloadResult {
  // `isPreferred`/`isAllowed` already proved bytes and type are present.
  return {
    ok: true,
    bytes: attempted.bytes as Uint8Array,
    contentType: attempted.contentType,
    via,
  };
}

/** Downloads an external image, trying the three documented strategies. */
export async function downloadImage(
  url: string,
  options: { fetchImpl?: FetchLike } = {},
): Promise<DownloadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const direct = await attempt(fetchImpl, url);
  if (isPreferred(direct)) return succeed(direct, "direct");

  let referred: Attempt | null = null;
  const referer = originOf(url);
  if (referer && (!direct.ok || !isPreferred(direct))) {
    referred = await attempt(fetchImpl, url, referer);
    if (isPreferred(referred)) return succeed(referred, "referer");
  }

  const proxied = await attempt(fetchImpl, proxyImageUrl(url));
  if (isAllowed(proxied)) return succeed(proxied, "proxy");

  // A valid WebP from the origin is still usable when the proxy is unavailable.
  if (isAllowed(direct)) return succeed(direct, "direct");
  if (referred && isAllowed(referred)) return succeed(referred, "referer");

  const candidates = [direct, referred, proxied];
  const blocked = candidates.some(
    (candidate) => candidate && (candidate.status === 403 || candidate.status === 406),
  );
  if (blocked) {
    return {
      ok: false,
      reason:
        "مصدر الصورة يمنع التنزيل من السيرفر. استبدل الصورة أو أعد المحاولة لاحقاً.",
    };
  }

  const sawImage = candidates.some(
    (candidate) => candidate && candidate.contentType.startsWith("image/"),
  );
  return {
    ok: false,
    reason: sawImage
      ? "نوع الصورة أو حجمها غير مدعوم."
      : "تعذر تنزيل الصورة من المصدر.",
  };
}
