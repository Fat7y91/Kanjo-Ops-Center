import { matchesSignature } from "@/lib/profile/upload";

/**
 * Validation for merchant logo and cover uploads.
 *
 * Same discipline as the profile buckets: the file is sniffed by its leading
 * bytes before anything is forwarded, so a renamed payload cannot be stored in
 * a public bucket just because it claimed `image/png`. Kept pure so it is unit
 * testable without Supabase.
 */

export type MerchantAssetKind = "logo" | "cover";

export const MERCHANT_ASSETS_BUCKET = "merchant-assets";

const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Covers are wider than logos, so they get a more generous size ceiling. */
const MAX_BYTES: Record<MerchantAssetKind, number> = {
  logo: 2 * 1024 * 1024,
  cover: 5 * 1024 * 1024,
};

export class MerchantAssetError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "MerchantAssetError";
    this.code = code;
    this.status = status;
  }
}

export function isMerchantAssetKind(value: unknown): value is MerchantAssetKind {
  return value === "logo" || value === "cover";
}

export type MerchantAssetAdmission = {
  mime: string;
  extension: string;
  bytes: Uint8Array;
};

/** Validates an uploaded image for the given asset kind. */
export async function admitMerchantAsset(
  kind: MerchantAssetKind,
  file: File,
): Promise<MerchantAssetAdmission> {
  const mime = file.type.toLowerCase();

  if (!MIME_TYPES.includes(mime as (typeof MIME_TYPES)[number])) {
    throw new MerchantAssetError("UNSUPPORTED_TYPE", "صيغة الصورة غير مدعومة.");
  }
  if (file.size === 0) {
    throw new MerchantAssetError("EMPTY_FILE", "الملف فارغ.");
  }
  if (file.size > MAX_BYTES[kind]) {
    throw new MerchantAssetError(
      "FILE_TOO_LARGE",
      `حجم الصورة يتجاوز الحد (${Math.round(MAX_BYTES[kind] / 1024 / 1024)} ميجابايت).`,
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(mime, bytes)) {
    throw new MerchantAssetError("CONTENT_MISMATCH", "محتوى الملف لا يطابق صيغته.");
  }

  return { mime, extension: EXTENSIONS[mime] ?? "bin", bytes };
}

/**
 * Storage object path: `<merchant id>/<kind>-<uuid>.<ext>`.
 *
 * A fresh uuid per upload means replacing an image never overwrites the old
 * object; the merchant folder keeps a given merchant's files together.
 */
export function merchantAssetPath(
  merchantId: string,
  kind: MerchantAssetKind,
  extension: string,
): string {
  return `${merchantId}/${kind}-${crypto.randomUUID()}.${extension}`;
}
