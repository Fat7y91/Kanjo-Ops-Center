import "server-only";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { parseImageDataUrl, toImageDataUrl } from "./base64";

/**
 * Content-addressed store for product photos captured by operators.
 *
 * Images live in `app.catalog_image_blobs` and are served by the public
 * `/api/catalog/images/[id]` route. Rows only ever hold an absolute URL, so the
 * catalog payload, Excel export and browser cache never carry Base64 again.
 */

const FALLBACK_ORIGIN = "https://kanjo-ops-center.pages.dev";
/** Never persist a manually-uploaded blob above this decoded size. */
export const STORED_IMAGE_MAX_BYTES = 1024 * 1024;
const IMAGE_PATH = "/api/catalog/images";
const IMAGE_PREFIX = "img-";

const encoder = new TextEncoder();

export type StoredCatalogImage = { id: string; url: string };

export type CatalogImageBlob = {
  contentType: string;
  dataUrl: string;
};

export function catalogImageOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || FALLBACK_ORIGIN).replace(/\/+$/, "");
}

export function catalogImageUrl(id: string): string {
  return `${catalogImageOrigin()}${IMAGE_PATH}/${encodeURIComponent(id)}`;
}

function contentTypeOf(dataUrl: string): string | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(dataUrl);
  return match ? match[1].toLowerCase() : null;
}

function base64Length(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return 0;
  return Math.max(0, Math.round(((dataUrl.length - comma - 1) * 3) / 4));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function contentId(dataUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(dataUrl));
  return `${IMAGE_PREFIX}${toHex(digest).slice(0, 32)}`;
}

/**
 * Persists a Base64 data URL and returns the public URL that replaces it.
 *
 * The id is the content hash, so retrying the same upload is idempotent and
 * the resulting URL can be cached immutably.
 */
export async function storeCatalogImage(
  dataUrl: string,
  merchantId: string | null = null,
): Promise<StoredCatalogImage> {
  const contentType = contentTypeOf(dataUrl);
  if (!contentType) {
    throw new Error("IMAGE_INVALID_DATA_URL");
  }
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) {
    throw new Error("IMAGE_INVALID_DATA_URL");
  }
  if (parsed.bytes.byteLength > STORED_IMAGE_MAX_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }

  const id = await contentId(dataUrl);
  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("catalog_image_blobs")
    .upsert(
      {
        id,
        merchant_id: merchantId,
        content_type: contentType,
        data_url: dataUrl,
        byte_size: base64Length(dataUrl),
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

  if (error) {
    throw new Error(`IMAGE_STORE_FAILED:${error.message}`);
  }
  return { id, url: catalogImageUrl(id) };
}

/**
 * Stores already-downloaded bytes under a caller-chosen id.
 *
 * The mirror workflow derives the id from the *source* reference, so repeating
 * a batch is idempotent: the same id is upserted and the same public URL is
 * returned. Rows keep only that URL, never the bytes.
 */
export async function storeCatalogImageBytes(
  id: string,
  bytes: Uint8Array,
  contentType: string,
  merchantId: string | null = null,
): Promise<string> {
  if (bytes.byteLength > STORED_IMAGE_MAX_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }
  const dataUrl = toImageDataUrl(contentType, bytes);
  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("catalog_image_blobs")
    .upsert(
      {
        id,
        merchant_id: merchantId,
        content_type: contentType,
        data_url: dataUrl,
        byte_size: bytes.byteLength,
      },
      { onConflict: "id" },
    );

  if (error) {
    throw new Error(`IMAGE_STORE_FAILED:${error.message}`);
  }
  return catalogImageUrl(id);
}

/**
 * Converts a legacy inline image into a stored URL.
 *
 * Any value that is not a data URL (already a URL, empty, null) is returned
 * untouched. Failures propagate so the write is rejected instead of silently
 * persisting Base64.
 */
export async function persistImageReference(
  value: string | null | undefined,
  merchantId: string | null = null,
): Promise<string | null> {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^data:/i.test(raw)) return raw;
  const stored = await storeCatalogImage(raw, merchantId);
  return stored.url;
}

export async function readCatalogImage(
  id: string,
): Promise<CatalogImageBlob | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("catalog_image_blobs")
    .select("content_type,data_url")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { content_type: string; data_url: string };
  if (!contentTypeOf(row.data_url)) return null;
  return { contentType: row.content_type, dataUrl: row.data_url };
}

/** Decodes the stored Base64 payload into raw bytes for the response body. */
export function imageBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}
