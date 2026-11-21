import "server-only";

import { resolveDisplayImageUrl } from "@/lib/catalog/format";
import type { MirrorItemResult } from "@/lib/catalog/mirror-payload";
import type { CatalogProduct } from "@/lib/catalog/types";

import { parseImageDataUrl } from "./base64";
import { downloadImage } from "./download";
import { sha256Hex } from "./hash";
import { isHostedImageUrl } from "./hosted";
import {
  headR2Object,
  isR2Configured,
  putR2Object,
  r2ObjectUrl,
} from "./r2";
import { storeCatalogImageBytes } from "./store";
import { updateProductImageUrl } from "../product-repository";

/**
 * Copies one product photo onto infrastructure we control.
 *
 * The source reference decides the object key, so a retried batch reuses both
 * the R2 object and the internal blob instead of storing a second copy. A single
 * bad link returns `failed` with a reason; it never throws and never blocks the
 * rest of the batch.
 */

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const R2_PREFIX = "catalog-images";

function failed(
  product: CatalogProduct,
  reason: string,
): MirrorItemResult {
  return {
    id: product.id,
    name: product.name,
    status: "failed",
    reason,
  };
}

async function hostImage(
  sourceHash: string,
  bytes: Uint8Array,
  contentType: string,
  merchantId: string,
): Promise<string> {
  const extension = EXTENSION[contentType] ?? "jpg";

  if (isR2Configured()) {
    const key = `${R2_PREFIX}/${sourceHash}.${extension}`;
    if (await headR2Object(key)) {
      const existing = r2ObjectUrl(key);
      if (existing) return existing;
    }
    return putR2Object(key, bytes, contentType);
  }

  return storeCatalogImageBytes(
    `img-${sourceHash}`,
    bytes,
    contentType,
    merchantId,
  );
}

function decodeInline(value: string): { bytes: Uint8Array; contentType: string } | null {
  const parsed = parseImageDataUrl(value);
  if (!parsed) return null;
  if (!EXTENSION[parsed.contentType]) return null;
  return parsed;
}

/** Mirrors the product's current image and rewrites `image_data_url`. */
export async function mirrorProductImage(
  product: CatalogProduct,
): Promise<MirrorItemResult> {
  const current = product.imageDataUrl?.trim() ?? "";
  if (!current) {
    return {
      id: product.id,
      name: product.name,
      status: "already_hosted",
      reason: "لا توجد صورة.",
    };
  }
  if (isHostedImageUrl(current)) {
    return {
      id: product.id,
      name: product.name,
      status: "already_hosted",
      url: current,
    };
  }

  // Marketplace rows store a signed `/api/image?url=…` proxy path and V1 rows
  // store Drive links. Resolve both to the real upstream URL before fetching.
  const source = resolveDisplayImageUrl(current) ?? current;

  let bytes: Uint8Array;
  let contentType: string;

  if (/^data:/i.test(source)) {
    const decoded = decodeInline(source);
    if (!decoded) return failed(product, "الصورة المضمنة غير صالحة.");
    bytes = decoded.bytes;
    contentType = decoded.contentType;
  } else if (/^https?:\/\//i.test(source)) {
    const downloaded = await downloadImage(source);
    if (!downloaded.ok) return failed(product, downloaded.reason);
    bytes = downloaded.bytes;
    contentType = downloaded.contentType;
  } else {
    return failed(product, "رابط الصورة غير مدعوم.");
  }

  const sourceHash = await sha256Hex(source);
  const url = await hostImage(
    sourceHash,
    bytes,
    contentType,
    product.merchantId,
  );
  const saved = await updateProductImageUrl(product.id, url);
  if (!saved) return failed(product, "تعذر حفظ رابط الصورة.");

  return {
    id: product.id,
    name: product.name,
    status: "mirrored",
    url,
  };
}

/**
 * Mirrors a remote reference image and returns a hosted URL.
 *
 * Used by the pharmacy importer so a POS row never stores the reference
 * merchant's third-party URL. Failures return null instead of throwing: an
 * unmirrorable photo must not block a valid product match.
 */
export async function mirrorRemoteImage(
  source: string | null | undefined,
  merchantId: string,
): Promise<string | null> {
  const raw = source?.trim() ?? "";
  if (!raw) return null;
  if (isHostedImageUrl(raw)) return raw;

  const resolved = resolveDisplayImageUrl(raw) ?? raw;
  if (!/^https?:\/\//i.test(resolved)) return null;

  const downloaded = await downloadImage(resolved);
  if (!downloaded.ok) return null;

  try {
    const sourceHash = await sha256Hex(resolved);
    return await hostImage(
      sourceHash,
      downloaded.bytes,
      downloaded.contentType,
      merchantId,
    );
  } catch (error) {
    console.error("[autopilot] image mirror failed", error);
    return null;
  }
}
