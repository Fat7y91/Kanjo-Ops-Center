/**
 * Font setup for the Kanjo PDF engine.
 *
 * Cairo is embedded once per document and the same parsed `fontkit` instance is
 * reused for shaping, so glyph ids written into the content stream always match
 * the embedded font program. Two static weights ship with the app (Regular and
 * Bold); no variable-font instancing happens at render time.
 */

import type { PDFDocument, PDFFont } from "pdf-lib";
import * as fontkit from "fontkit";
import type { Font } from "fontkit";

import {
  CAIRO_BOLD_BASE64,
  CAIRO_REGULAR_BASE64,
} from "@/lib/contracts/render/data/pdf-assets";
import type { FontFace } from "./types";

export type EmbeddedFace = {
  /** Embeddable handle used by `pdf-lib` when registering the page resource. */
  pdf: PDFFont;
  /** Parsed font used for shaping and metrics. */
  metrics: Font;
  bold: boolean;
};

export type FontSet = {
  regular: EmbeddedFace;
  bold: EmbeddedFace;
};

const BASE64_DIGITS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodes standard base64 to bytes without relying on `Buffer`/`atob`. */
export function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byte = 0;
  let bits = 0;
  let length = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = BASE64_DIGITS.indexOf(clean[i]!);
    if (code < 0) continue;
    byte = (byte << 6) | code;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[length] = (byte >> bits) & 0xff;
      length += 1;
    }
  }
  return out.subarray(0, length);
}

/**
 * Embeds both Cairo weights and parses them for shaping.
 *
 * The same bytes feed `pdf-lib` (which embeds the program and builds a ToUnicode
 * map) and `fontkit` (which produces glyph ids). Using one source guarantees
 * the ids we draw resolve to the glyphs we measured.
 */
export async function embedFonts(doc: PDFDocument): Promise<FontSet> {
  const regularBytes = decodeBase64(CAIRO_REGULAR_BASE64);
  const boldBytes = decodeBase64(CAIRO_BOLD_BASE64);

  // pdf-lib needs a fontkit instance to parse raw TTF bytes; hand it the same
  // module we shape with so embedding and shaping agree on parsing. pdf-lib
  // types only the `create` method; our richer fontkit types are a superset.
  doc.registerFontkit(fontkit as unknown as Parameters<PDFDocument["registerFontkit"]>[0]);

  // `subset: false` embeds the full program. pdf-lib's subsetter is a separate
  // code path that has proven brittle across fontkit versions; the two Cairo
  // subsets are small enough (about 68 KB each) to embed whole.
  const [regularPdf, boldPdf] = await Promise.all([
    doc.embedFont(regularBytes, { subset: false }),
    doc.embedFont(boldBytes, { subset: false }),
  ]);

  return {
    regular: {
      pdf: regularPdf,
      metrics: fontkit.create(regularBytes),
      bold: false,
    },
    bold: {
      pdf: boldPdf,
      metrics: fontkit.create(boldBytes),
      bold: true,
    },
  };
}

export function faceFor(fonts: FontSet, face: FontFace): EmbeddedFace {
  return face === "bold" ? fonts.bold : fonts.regular;
}

/** Points-per-font-unit factor for the given face and size. */
export function pointScale(face: EmbeddedFace, size: number): number {
  return size / face.metrics.unitsPerEm;
}
