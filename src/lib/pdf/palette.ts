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
  ink: hex("#1B0F26"),
  inkSoft: hex("#4B3B5A"),
  muted: hex("#6B7280"),
  royal: hex("#3B0764"),
  purple: hex("#6C35B6"),
  purpleSoft: hex("#F3EDFB"),
  gold: hex("#B8860B"),
  goldBright: hex("#E0B84C"),
  goldSoft: hex("#FBF3DC"),
  panel: hex("#F8F5FC"),
  line: hex("#E6DAF3"),
  lineStrong: hex("#C9B6E4"),
  white: hex("#FFFFFF"),
  success: hex("#15803D"),
  warning: hex("#B45309"),
} as const;

export type Palette = typeof PALETTE;
