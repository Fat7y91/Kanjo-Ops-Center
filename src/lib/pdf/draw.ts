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
  /**
   * Stretch inter-word gaps so the line fills this width in points. Ignored when
   * the natural width already meets or exceeds it, or when the line has no
   * spaces. Used for justified body paragraphs (never for the last line).
   */
  justifyWidth?: number;
};

/** Cached space glyph id per face; -1 when the face has no space glyph. */
const spaceGlyphIds = new WeakMap<object, number>();

function spaceGlyphId(face: EmbeddedFace): number {
  const cached = spaceGlyphIds.get(face);
  if (cached !== undefined) return cached;
  const glyph = face.metrics.layout(" ").glyphs[0];
  const id = glyph ? glyph.id : -1;
  spaceGlyphIds.set(face, id);
  return id;
}

/**
 * Distributes `targetWidth - naturalWidth` across the spaces of a shaped line.
 *
 * The extra advance is added to every space glyph and to the owning run's width,
 * so the drawing layer's right-to-left mirroring stays correct: the whole run
 * widens and each following glyph shifts by exactly the gap it should.
 */
function justifyRuns(
  runs: ShapedRun[],
  naturalWidth: number,
  targetWidth: number,
  size: number,
  faces: Faces,
): number {
  let gaps = 0;
  for (const run of runs) {
    const id = spaceGlyphId(run.bold ? faces.bold : faces.regular);
    if (id < 0) continue;
    for (const glyph of run.glyphs) if (glyph.id === id) gaps += 1;
  }
  if (gaps === 0) return naturalWidth;

  const extraPoints = targetWidth - naturalWidth;
  for (const run of runs) {
    const face = run.bold ? faces.bold : faces.regular;
    const id = spaceGlyphId(face);
    if (id < 0) continue;
    const scale = size / face.metrics.unitsPerEm;
    const addUnits = extraPoints / gaps / scale;
    for (const glyph of run.glyphs) {
      if (glyph.id !== id) continue;
      glyph.advance += addUnits;
      run.width += addUnits;
    }
  }

  let totalUnits = 0;
  for (const run of runs) totalUnits += run.width;
  return (totalUnits * size) / faces.regular.metrics.unitsPerEm;
}

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
    justifyWidth,
  } = options;

  const shaped = shapeSpans(spans, direction, faces);
  if (shaped.runs.length === 0) return 0;

  const boxRight = maxWidth === undefined ? x : x + maxWidth;
  let widthPoints = (shaped.width * size) / faces.regular.metrics.unitsPerEm;
  if (justifyWidth !== undefined && justifyWidth > widthPoints) {
    widthPoints = justifyRuns(shaped.runs, widthPoints, justifyWidth, size, faces);
  }
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
