/**
 * Text shaping for the Kanjo PDF engine.
 *
 * Turns styled spans into shaped glyph runs, ready to be placed on the page.
 * The pipeline is the same one react-pdf's textkit uses, reimplemented on top of
 * `bidi-js` + `fontkit` so it stays pure JavaScript (no runtime WASM):
 *
 *   1. resolve bidi embedding levels for the paragraph (UAX #9);
 *   2. mirror paired brackets in right-to-left runs (rule L4);
 *   3. shape every run with fontkit in `"ltr"` mode so it does not reorder;
 *   4. split runs at style boundaries and reorder them visually (rule L2).
 *
 * Glyphs inside a run stay in logical order. The drawing layer mirrors odd
 * (right-to-left) runs when it places them, which keeps harakat offsets correct.
 */

import type { FontGlyphRun } from "fontkit";

import { embeddingLevels, mirrorText, reorderRuns, splitBidiRuns } from "./bidi";
import type { EmbeddedFace } from "./font";
import type { Direction, ShapedGlyph, ShapedRun, StyledSpan } from "./types";

type RawGlyph = { id: number; advance: number; offsetX: number; offsetY: number };

function shapeRun(face: EmbeddedFace, text: string): { glyphs: RawGlyph[]; width: number } {
  const layout: FontGlyphRun = face.metrics.layout(
    text,
    undefined,
    undefined,
    undefined,
    "ltr",
  );
  const glyphs: RawGlyph[] = [];
  let width = 0;
  for (let i = 0; i < layout.glyphs.length; i += 1) {
    const position = layout.positions[i]!;
    glyphs.push({
      id: layout.glyphs[i]!.id,
      advance: position.xAdvance,
      offsetX: position.xOffset,
      offsetY: position.yOffset,
    });
    width += position.xAdvance;
  }
  return { glyphs, width };
}

function boldMask(spans: StyledSpan[]): { text: string; boldAt: boolean[] } {
  let text = "";
  const boldAt: boolean[] = [];
  for (const span of spans) {
    text += span.text;
    for (let i = 0; i < span.text.length; i += 1) boldAt.push(Boolean(span.bold));
  }
  return { text, boldAt };
}

export type ShapeResult = {
  runs: ShapedRun[];
  /** Total width in font units (upem-relative). */
  width: number;
  /** Concatenated logical text that was shaped. */
  text: string;
};

/**
 * Shapes styled spans read in `direction` and returns runs in visual order.
 *
 * Each `ShapedRun` carries glyphs in logical order; odd-level runs must be
 * mirrored by the drawing layer.
 */
export function shapeSpans(
  spans: StyledSpan[],
  direction: Direction,
  fonts: { regular: EmbeddedFace; bold: EmbeddedFace },
): ShapeResult {
  const { text, boldAt } = boldMask(spans);
  if (text.length === 0) return { runs: [], width: 0, text };

  const levels = embeddingLevels(text, direction);
  const mirrored = mirrorText(text, direction, levels);
  const bidiRuns = splitBidiRuns(text, levels);

  const visualRuns: ShapedRun[][] = bidiRuns.map((bidiRun) => {
    const subRuns: ShapedRun[] = [];
    let start = bidiRun.start;
    for (let i = bidiRun.start + 1; i <= bidiRun.end; i += 1) {
      if (i === bidiRun.end || boldAt[i] !== boldAt[start]) {
        const bold = Boolean(boldAt[start]);
        const sub = mirrored.slice(start, i);
        const { glyphs, width } = shapeRun(bold ? fonts.bold : fonts.regular, sub);
        subRuns.push({
          level: bidiRun.level,
          bold,
          width,
          glyphs: glyphs.map(
            (g): ShapedGlyph => ({
              id: g.id,
              advance: g.advance,
              offsetX: g.offsetX,
              offsetY: g.offsetY,
            }),
          ),
        });
        start = i;
      }
    }
    // An odd (RTL) run's styled sub-runs must appear right-to-left, which for a
    // left-to-right drawing pen means reversing their order.
    if (bidiRun.level & 1) subRuns.reverse();
    return subRuns;
  });

  const order = reorderRuns(bidiRuns.map((run) => run.level));
  const runs: ShapedRun[] = [];
  let width = 0;
  for (const index of order) {
    for (const run of visualRuns[index]!) {
      runs.push(run);
      width += run.width;
    }
  }
  return { runs, width, text };
}

/** Width of a string in points at `size`, using `face`. */
export function measureWidth(face: EmbeddedFace, text: string, size: number): number {
  if (!text) return 0;
  const layout: FontGlyphRun = face.metrics.layout(
    text,
    undefined,
    undefined,
    undefined,
    "ltr",
  );
  const units = layout.positions.reduce((total, position) => total + position.xAdvance, 0);
  return (units * size) / face.metrics.unitsPerEm;
}

/** A face selector for the engine's two weights. */
export type Faces = { regular: EmbeddedFace; bold: EmbeddedFace };
