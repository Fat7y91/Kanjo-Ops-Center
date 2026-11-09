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
  /** Cover kicker line above the partnership title. */
  coverKicker: style(12, PALETTE.goldBright, 18),
  /** Large cover title. */
  coverTitle: style(26, PALETTE.royal, 40),
  /** Merchant name line on the cover. */
  coverName: style(19, PALETTE.ink, 30),
  /** Cover supporting metadata. */
  coverMeta: style(10, PALETTE.inkSoft, 16),
  /** Main contract title in the running header. */
  title: style(17, PALETTE.royal, 24),
  /** Section and clause headings. */
  heading: style(12.5, PALETTE.royal, 19),
  /** Secondary labels inside panels. */
  label: style(9.6, PALETTE.royal, 15),
  /** Body copy inside clauses and panels. */
  body: style(10.5, PALETTE.ink, 18.5),
  /** Slightly smaller body for dense identification panels. */
  dense: style(9.8, PALETTE.ink, 16),
  /** Small print: notes, footer, copyright. */
  small: style(8.6, PALETTE.muted, 13),
  /** Table cells. */
  cell: style(9.8, PALETTE.ink, 15),
  /** Table header cells (white on purple). */
  cellHead: style(9.8, PALETTE.white, 15),
} as const;
