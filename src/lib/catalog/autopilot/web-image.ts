export type SerperImage = {
  imageUrl?: string;
  thumbnailUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  title?: string;
  source?: string;
  link?: string;
};

const WATERMARK_HOSTS = [
  "shutterstock",
  "istockphoto",
  "gettyimages",
  "alamy",
  "dreamstime",
  "depositphotos",
  "123rf",
  "vectorstock",
  "freepik",
  "adobestock",
  "canstockphoto",
  "bigstockphoto",
  "agefotostock",
];

const SHOP_HOSTS = [
  "amazon",
  "noon",
  "jumia",
  "carrefour",
  "spinneys",
  "seoudi",
  "metro",
  "hyperone",
  "otlob",
  "talabat",
  "shopify",
  "woocommerce",
  "openfoodfacts",
  "barcodelookup",
  "barcode-list",
  "product",
  "cdn",
  "images",
  "img",
];

const SOCIAL_HOSTS = ["pinterest", "facebook", "instagram", "tiktok", "x.com"];

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isUsableImage(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) return null;
  if (WATERMARK_HOSTS.some((blocked) => host.includes(blocked))) return null;
  if (/watermark|watermarked/i.test(parsed.pathname)) return null;
  return parsed.toString();
}

/**
 * Picks the best product photo from Serper's image results: HTTPS only,
 * watermark/stock hosts removed, high-resolution and shop domains preferred.
 * Pure so the selection rule can be tested without calling Serper.
 */
export function selectProductImage(
  images: SerperImage[],
): { url: string; title: string } | null {
  const scored: { url: string; title: string; score: number; index: number }[] = [];

  images.forEach((image, index) => {
    const raw = image.imageUrl ?? "";
    const url = isUsableImage(raw);
    if (!url) return;

    const width = Number(image.imageWidth) || 0;
    const height = Number(image.imageHeight) || 0;
    if ((width > 0 && width < 300) || (height > 0 && height < 300)) return;

    const host = hostOf(url);
    let score = 0;
    if (width >= 800 && height >= 800) score += 6;
    else if (width >= 500 && height >= 500) score += 4;
    else if (width >= 300 && height >= 300) score += 2;
    else score += 1;

    if (width > 0 && height > 0) {
      const ratio = width / height;
      if (ratio >= 0.45 && ratio <= 2.2) score += 2;
    }
    if (SHOP_HOSTS.some((shop) => host.includes(shop))) score += 5;
    if (SOCIAL_HOSTS.some((social) => host.includes(social))) score -= 5;
    if (/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(url)) score += 1;
    if (/product|item|sku|pack|bottle|can|box/i.test(url)) score += 1;

    scored.push({
      url,
      title: (image.title ?? "").trim().slice(0, 160),
      score,
      index,
    });
  });

  const best = scored.sort(
    (left, right) => right.score - left.score || left.index - right.index,
  )[0];
  return best ? { url: best.url, title: best.title } : null;
}

/** Removes POS noise from a name for a fallback web search query. */
export function cleanImageQuery(name: string, unit: string): string {
  return [name, unit]
    .join(" ")
    .replace(/[/*\\|]+/g, " ")
    .replace(/\b(?:صنف|منتج|كود|باركود|سعر)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}
