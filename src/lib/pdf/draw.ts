/**
 * Glyph drawing for the Kanjo PDF engine.
 *
 * Shapes styled spans and writes them into a `pdf-lib` content stream one glyph
 * at a time. Drawing per glyph (rather than one `showText` per run) is required
 * for two reasons:
 *
 *   - odd (right-to-left) runs are mirrored by reversing glyph order and
 *     mirroring each glyph's advance and mark offset, so harakat land over the
 *     correct base letter;
 *   - glyph advances come from fontkit and can differ from the font's nominal
 *     `advanceWidth`, so we place each glyph at the pen position fontkit
 *     measured instead of trusting the PDF text engine.
 */

import {
  PDFHexString,
  beginText,
  endText,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  showText,
  type PDFName,
  type PDFPage,
} from "pdf-lib";

import type { EmbeddedFace } from "./font";
import { shapeSpans, type Faces } from "./shape";
import { PALETTE, type Rgb } from "./palette";
import type { Direction, ShapedRun, StyledSpan, TextAlign } from "./types";

function toHex(id: number): string {
  return id.toString(16).padStart(4, "0");
}

/**
 * Draws one shaped run at `penX` (baseline `y`) and returns the advanced pen.
 *
 * For an odd (RTL) run the glyphs are laid out right-to-left: the pen starts at
 * the run's right edge and each glyph is placed at `start + (width - pen - x)`,
 * which mirrors both the advance and the mark offset so diacritics stay valid.
 */
function drawRun(
  page: PDFPage,
  face: EmbeddedFace,
  key: PDFName,
  run: ShapedRun,
  penX: number,
  y: number,
  size: number,
  color: Rgb,
): number {
  const { unitsPerEm } = face.metrics;
  const scale = size / unitsPerEm;
  const operators = [beginText(), setFillingColor(color), setFontAndSize(key, size)];
  let pen = 0;

  for (const glyph of run.glyphs) {
    const xUnits =
      run.level & 1
        ? run.width - pen - glyph.advance + glyph.offsetX
        : pen + glyph.offsetX;
    const glyphX = penX + xUnits * scale;
    const glyphY = y + glyph.offsetY * scale;
    operators.push(
      setTextMatrix(1, 0, 0, 1, glyphX, glyphY),
      showText(PDFHexString.of(toHex(glyph.id))),
    );
    pen += glyph.advance;
  }
  operators.push(endText());
  page.pushOperators(...operators);
  return penX + run.width * scale;
}

/** Where a shaped line starts, given its alignment and the box it fills. */
function lineStartX(
  width: number,
  boxLeft: number,
  boxRight: number,
  align: TextAlign,
  direction: Direction,
): number {
  const resolved =
    align === "center"
      ? "center"
      : align === "end"
        ? direction === "rtl"
          ? "left"
          : "right"
        : direction === "rtl"
          ? "right"
          : "left";
  if (resolved === "center") return boxLeft + (boxRight - boxLeft - width) / 2;
  if (resolved === "right") return boxRight - width;
  return boxLeft;
}

export type DrawTextOptions = {
  page: PDFPage;
  faces: Faces;
  fontKeys: { regular: PDFName; bold: PDFName };
  spans: StyledSpan[];
  x: number;
  y: number;
  size: number;
  maxWidth?: number;
  align?: TextAlign;
  direction?: Direction;
  color?: Rgb;
};

/**
 * Draws a single line of styled text and returns its width in points.
 *
 * The caller owns vertical flow; this only places one line and reports how wide
 * it was so callers can underline, box, or centre neighbours.
 */
export function drawLine(options: DrawTextOptions): number {
  const {
    page,
    faces,
    fontKeys,
    spans,
    x,
    y,
    size,
    maxWidth,
    align = "start",
    direction = "rtl",
    color = PALETTE.ink,
  } = options;

  const shaped = shapeSpans(spans, direction, faces);
  if (shaped.runs.length === 0) return 0;

  const boxRight = maxWidth === undefined ? x : x + maxWidth;
  const widthPoints = (shaped.width * size) / faces.regular.metrics.unitsPerEm;
  let penX = lineStartX(widthPoints, x, boxRight, align, direction);
  for (const run of shaped.runs) {
    penX = drawRun(
      page,
      run.bold ? faces.bold : faces.regular,
      run.bold ? fontKeys.bold : fontKeys.regular,
      run,
      penX,
      y,
      size,
      color,
    );
  }
  return widthPoints;
}
