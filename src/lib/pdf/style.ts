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
  coverTitle: style(27, PALETTE.coverRoyal, 42),
  /** Merchant name line on the cover. */
  coverName: style(20, PALETTE.ink, 32),
  /** Cover supporting metadata. */
  coverMeta: style(10.5, PALETTE.inkSoft, 17),
  /** Main contract title in the running header. */
  title: style(17, PALETTE.royal, 24),
  /** Section and clause headings. */
  heading: style(13, PALETTE.royal, 20),
  /** Secondary labels inside panels. */
  label: style(9.8, PALETTE.royal, 15.5),
  /** Body copy inside clauses and panels. */
  body: style(10.8, PALETTE.ink, 18.9),
  /** Slightly smaller body for dense identification panels. */
  dense: style(10.2, PALETTE.ink, 17.8),
  /** Small print: notes, footer, copyright. */
  small: style(8.6, PALETTE.muted, 13),
  /** Table cells. */
  cell: style(10, PALETTE.ink, 16),
  /** Table header cells (white on purple). */
  cellHead: style(10, PALETTE.white, 16),
} as const;
