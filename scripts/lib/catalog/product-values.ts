/** Pure V1 → V2 value mapping shared by the catalog audit and restoration. */

export type JsonObject = Record<string, unknown>;

export type VariantSeed = {
  variant_id: number;
  name_ar: string;
  name_en: string;
};

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u061C]/g;

export function baseName(value: unknown): string {
  let name = String(value ?? "").replace(INVISIBLE, "");
  while (name.includes("(متابعة)") || name.includes("(متابعه)")) {
    name = name
      .replace(/\s*\(متابعة\)\s*/g, "")
      .replace(/\s*\(متابعه\)\s*/g, "")
      .trim();
  }
  return name.trim();
}

/** Mirrors `normalizeName` in scripts/migrate-v1-to-v2.ts. */
export function normalizeName(value: unknown): string {
  return baseName(value)
    .normalize("NFKC")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export const text = (value: unknown): string =>
  value == null ? "" : String(value);

export const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const candidate = text(value).trim();
    if (candidate) return candidate;
  }
  return "";
};

const numberValue = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(text(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const toMinor = (value: unknown): number =>
  Math.round(numberValue(value) * 100);

export function toIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "object") {
    const obj = value as JsonObject;
    const seconds = obj._seconds ?? obj.seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      const nanos = Number(obj._nanoseconds ?? obj.nanoseconds ?? 0);
      const date = new Date(seconds * 1000 + Math.floor(nanos / 1e6));
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = Date.parse(text(value));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function driveFileId(value: unknown): string {
  const url = text(value);
  if (!url) return "";
  const match = url.match(/[?&]id=([^&]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return /^[a-zA-Z0-9_-]{10,}$/.test(url) ? url : "";
}

function displayImageUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  if (/^(data:image\/|https?:\/\/)/i.test(url)) return url;
  const id = driveFileId(url);
  return id ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}` : null;
}

function firstImage(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImage(item);
      if (found) return found;
    }
    return "";
  }
  return text(value);
}

export function pickImage(product: JsonObject): string | null {
  const enhanced = firstImage(product.enhancedImageUrls) || firstImage(product.enhancedImageUrl);
  const raw = firstImage(product.rawImageUrls) || firstImage(product.rawImageUrl);
  return displayImageUrl(
    enhanced || raw || firstImage(product.image_url) || firstImage(product.imageUrl),
  );
}

export function productState(status: unknown): "pending_review" | "completed" | "published" {
  const value = text(status).toLowerCase();
  return value === "done" || value === "completed" || value === "published"
    ? "completed"
    : "pending_review";
}

export function buildAttributes(
  product: JsonObject,
  variants: VariantSeed[],
): JsonObject[] {
  const variations = Array.isArray(product.variations) ? product.variations : [];
  return variations.map((row) => {
    const variation = (row ?? {}) as JsonObject;
    const label = firstText(variation.name);
    const variant = variants.find(
      (candidate) =>
        normalizeName(candidate.name_ar) === normalizeName(label) ||
        normalizeName(candidate.name_en) === normalizeName(label),
    );
    return {
      variantId: variant ? variant.variant_id : null,
      variantLabel: label,
      optionIds: [] as number[],
      price_minor: toMinor(variation.price),
      image_url: text(variation.image_url),
    };
  });
}

const QA_KEYS = [
  "image_locked_by",
  "image_locked_by_name",
  "image_locked_at",
  "image_uploaded_by",
  "image_uploaded_at",
  "edit_type",
  "edited_by",
  "edited_at",
  "upload_history",
  "uploaded_at",
  "score",
  "importSource",
  "intakeSource",
  "deleteRequested",
  "deleteRequestedAt",
  "deleteRequestedBy",
  "kanjo_id",
  "kanjo_category_ids",
] as const;

export function qaMetadata(product: JsonObject): JsonObject {
  const meta: JsonObject = {};
  for (const key of QA_KEYS) {
    if (product[key] !== undefined) meta[key] = product[key];
  }
  return meta;
}
