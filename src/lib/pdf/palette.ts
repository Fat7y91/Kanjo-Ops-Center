/**
 * Print palette for the Kanjo document engine.
 *
 * Separate from the on-screen design tokens: printed paperwork keeps a deeper,
 * calmer purple and a darker gold so text stays legible on white paper and on
 * low-quality office printers. Colours are `pdf-lib` `Color` values so they can
 * be handed straight to drawing helpers (`rgb()` from `pdf-lib`).
 */

import { rgb, type Color } from "pdf-lib";

export type Rgb = Color;

function hex(value: string): Rgb {
  const clean = value.replace("#", "");
  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  );
}

export const PALETTE = {
  /** Deepest ink for body copy on white paper. */
  ink: hex("#1B1024"),
  inkStrong: hex("#0F0717"),
  /** Softer ink for secondary lines and labels. */
  inkSoft: hex("#463652"),
  slate: hex("#334155"),
  muted: hex("#6B7280"),
  /** Primary brand purple, matching the issued V1 contracts. */
  royal: hex("#4B0082"),
  /** Darker purple used for cover bands and mastheads. */
  royalDeep: hex("#2C0A4D"),
  /** Mid purple for gradients-by-bands and accents. */
  royalMid: hex("#5B1799"),
  purple: hex("#6C35B6"),
  purpleSoft: hex("#F3EDFB"),
  gold: hex("#B8860B"),
  goldDeep: hex("#8C6508"),
  goldBright: hex("#D9B44A"),
  goldSoft: hex("#FBF3DC"),
  /** Card and panel fills. */
  panel: hex("#F7F4FB"),
  panelAlt: hex("#FDFBF7"),
  line: hex("#E7DEF3"),
  lineStrong: hex("#CBB8E4"),
  white: hex("#FFFFFF"),
  success: hex("#15803D"),
  warning: hex("#B45309"),
} as const;

export type Palette = typeof PALETTE;
