/**
 * Shared value types for the Kanjo PDF engine.
 *
 * The engine is framework-free: it turns styled text into shaped glyph runs and
 * draws them with `pdf-lib` operators. These are the small value types shared by
 * the bidi, shaping, layout and drawing modules.
 */

import type { Rgb } from "./palette";

export type { Rgb };

/** Font face used for a span of text. Cairo ships in two static weights. */
export type FontFace = "regular" | "bold";

/** A run of text that shares one font face. */
export type StyledSpan = { text: string; bold?: boolean };

/** Logical reading direction of a paragraph. */
export type Direction = "rtl" | "ltr";

/** Horizontal alignment inside a text box, in logical terms. */
export type TextAlign = "start" | "center" | "end";

/**
 * One shaped glyph, in logical order within its run.
 *
 * `advance`, `offsetX` and `offsetY` are in font units (upem-relative). Marks
 * (harakat) carry zero advance and a non-zero offset that positions them over
 * their base glyph.
 */
export type ShapedGlyph = {
  id: number;
  advance: number;
  offsetX: number;
  offsetY: number;
};

/** A shaped run of glyphs that share one face and one bidi level. */
export type ShapedRun = {
  glyphs: ShapedGlyph[];
  level: number;
  bold: boolean;
  /** Total advance width in font units. */
  width: number;
};

/** A fully shaped line: runs in visual order plus total width in points. */
export type ShapedLine = {
  runs: ShapedRun[];
  /** Total width in points at the requested size. */
  width: number;
};
