/**
 * Image assets for the contract PDF.
 *
 * Both images ship as base64 in `data/pdf-assets.ts`: the Kanjo mark is a small
 * JPEG used for the header and a very faint page watermark, and the merchant logo
 * arrives as a resolved JPEG/PNG data URI (or empty when unavailable). This module
 * decodes them to bytes and hands them to the document writer, which owns the
 * actual `pdf-lib` embedding.
 */

import {
  KANJO_LOGO_BASE64,
} from "../data/pdf-assets";
import { decodeBase64 } from "@/lib/pdf";

/** Decoded Kanjo mark bytes (200×200 JPEG). */
export function kanjoLogoBytes(): Uint8Array {
  return decodeBase64(KANJO_LOGO_BASE64);
}

/**
 * Decodes a `data:image/...;base64,...` URI to bytes.
 *
 * Returns `null` for anything that is not a base64 raster data URI; the layout
 * treats a missing merchant logo as "print without it" rather than failing.
 */
export function decodeLogoDataUri(uri: string | undefined): Uint8Array | null {
  if (!uri) return null;
  const match = /^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/i.exec(uri);
  if (!match) return null;
  const bytes = decodeBase64(match[1]!.replace(/\s+/g, ""));
  return bytes.length > 0 ? bytes : null;
}
