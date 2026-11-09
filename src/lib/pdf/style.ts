/**
 * Text style presets for the Kanjo contract document.
 *
 * Sizes and colours are chosen for A4 print: the body sits at 10.5pt for
 * legibility on office printers, headings step up in the brand purple, and the
 * small print stays above 8pt so it survives compression. Callers pass these to
 * the canvas drawing primitives.
 */

import { PALETTE } from "./palette";
import type { Rgb } from "./palette";

export type TextStyle = {
  size: number;
  color: Rgb;
  lineHeight: number;
};

function style(size: number, color: Rgb, lineHeight = size * 1.75): TextStyle {
  return { size, color, lineHeight };
}

export const TEXT = {
  /** Main contract title under the header. */
  title: style(19, PALETTE.royal, 26),
  /** Section and clause headings. */
  heading: style(12, PALETTE.royal, 20),
  /** Body copy inside clauses and panels. */
  body: style(10.5, PALETTE.ink, 18),
  /** Slightly smaller body for dense identification panels. */
  dense: style(9.8, PALETTE.ink, 16),
  /** Small print: notes, footer, copyright. */
  small: style(8.6, PALETTE.muted, 13),
  /** Table cells. */
  cell: style(9.8, PALETTE.ink, 15),
  /** Table header cells (white on purple). */
  cellHead: style(9.8, PALETTE.white, 15),
} as const;
