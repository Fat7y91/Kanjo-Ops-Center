/**
 * Bidirectional run analysis for the Kanjo PDF engine.
 *
 * Wraps `bidi-js` to produce, for a paragraph string, the per-character bidi
 * embedding levels that decide reading order. The algorithm itself (UAX #9) is
 * entirely inside the library; this module only exposes the small surface the
 * layout code needs and mirrors the run-splitting rules used by react-pdf's
 * `@react-pdf/textkit`, so the two renderers agree on visual order.
 */

import bidiFactory from "bidi-js";

const bidi = bidiFactory();

/** A maximal slice of the paragraph at one bidi level. */
export type BidiRun = {
  /** Inclusive start offset (UTF-16 code units). */
  start: number;
  /** Exclusive end offset. */
  end: number;
  level: number;
};

/**
 * Character levels for a paragraph read in `direction`.
 *
 * Level parity decides visual direction: even levels read left-to-right, odd
 * levels right-to-left. The returned array has one entry per UTF-16 code unit.
 */
export function embeddingLevels(
  text: string,
  direction: "rtl" | "ltr",
): Uint8Array {
  return bidi.getEmbeddingLevels(text, direction).levels;
}

/**
 * Splits a paragraph into contiguous runs of equal bidi level.
 *
 * Two adjacent characters join the same run only when their levels are equal,
 * so a run never mixes a strong right-to-left letter with a neutral space that
 * resolved the other way.
 */
export function splitBidiRuns(text: string, levels: Uint8Array): BidiRun[] {
  if (text.length === 0) return [];
  const runs: BidiRun[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i += 1) {
    if (i === text.length || levels[i] !== levels[start]) {
      runs.push({ start, end: i, level: levels[start]! });
      start = i;
    }
  }
  return runs;
}

/**
 * Mirror bracket characters for display.
 *
 * UAX #9 rule L4 swaps paired brackets ("(" ↔ ")") when they resolve to a
 * right-to-left level. We apply it per character by level parity rather than via
 * `getMirroredCharactersMap`, which only reports brackets the algorithm paired
 * explicitly and returns an empty map for plenty of valid RTL phrases.
 */
export function mirrorText(
  text: string,
  direction: "rtl" | "ltr",
  levels?: Uint8Array,
): string {
  if (text.length === 0) return text;
  const resolved = levels ?? bidi.getEmbeddingLevels(text, direction).levels;
  let changed = false;
  const chars = text.split("");
  for (let i = 0; i < chars.length; i += 1) {
    if ((resolved[i] ?? 0) & 1) {
      const mirrored = bidi.getMirroredCharacter(chars[i]!);
      if (mirrored) {
        chars[i] = mirrored;
        changed = true;
      }
    }
  }
  return changed ? chars.join("") : text;
}

/**
 * Orders runs for visual display using UAX #9 rule L2.
 *
 * From the highest embedding level down to level 1, every contiguous sequence
 * of runs at that level or above is reversed. `runs` must be in logical order;
 * the returned array is the visual left-to-right order.
 */
export function reorderRuns(levels: number[]): number[] {
  const order = levels.map((_, index) => index);
  if (levels.length === 0) return order;
  const maxLevel = Math.max(...levels);
  for (let level = maxLevel; level >= 1; level -= 1) {
    let start = 0;
    while (start < order.length) {
      if (levels[order[start]!]! < level) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (end < order.length && levels[order[end]!]! >= level) end += 1;
      const reversed = order.slice(start, end).reverse();
      order.splice(start, end - start, ...reversed);
      start = end;
    }
  }
  return order;
}
