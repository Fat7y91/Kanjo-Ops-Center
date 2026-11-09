/**
 * Paragraph layout for the Kanjo PDF engine.
 *
 * Wraps styled spans into lines that fit a maximum width. The renderer measures
 * candidates with the same shaper it draws with, so a line never overflows its
 * box because two shaping passes disagreed on width.
 */

import { shapeSpans, type Faces } from "./shape";
import type { Direction, StyledSpan } from "./types";

/** Splits styled spans into whitespace-preserving word tokens. */
function tokenize(spans: StyledSpan[]): StyledSpan[] {
  const tokens: StyledSpan[] = [];
  for (const span of spans) {
    for (const part of span.text.split(/(\s+)/)) {
      if (part.length > 0) tokens.push({ text: part, bold: span.bold });
    }
  }
  return tokens;
}

const isWhitespace = (value: string): boolean => /^\s+$/.test(value);

function trimLeadingWhitespace(spans: StyledSpan[]): StyledSpan[] {
  const out = spans.slice();
  while (out.length > 0 && isWhitespace(out[0]!.text)) out.shift();
  if (out.length > 0) {
    const first = out[0]!;
    out[0] = { text: first.text.replace(/^\s+/, ""), bold: first.bold };
  }
  return out.filter((span) => span.text.length > 0);
}

function trimTrailingWhitespace(spans: StyledSpan[]): StyledSpan[] {
  const out = spans.slice();
  while (out.length > 0 && isWhitespace(out[out.length - 1]!.text)) out.pop();
  if (out.length > 0) {
    const last = out[out.length - 1]!;
    out[out.length - 1] = { text: last.text.replace(/\s+$/, ""), bold: last.bold };
  }
  return out.filter((span) => span.text.length > 0);
}

/** Width of a shaped span list in points at `size`. */
export function measureSpans(
  spans: StyledSpan[],
  size: number,
  faces: Faces,
  direction: Direction,
): number {
  const { width } = shapeSpans(spans, direction, faces);
  return (width * size) / faces.regular.metrics.unitsPerEm;
}

/**
 * Wraps spans into lines no wider than `maxWidth`.
 *
 * Whitespace tokens are kept while they fit and dropped at a line break, so a
 * shaped line never starts or ends with a stray space.
 */
export function wrapSpans(
  spans: StyledSpan[],
  maxWidth: number,
  size: number,
  faces: Faces,
  direction: Direction,
): StyledSpan[][] {
  const tokens = tokenize(spans);
  const lines: StyledSpan[][] = [];
  let line: StyledSpan[] = [];

  for (const token of tokens) {
    if (isWhitespace(token.text)) {
      if (line.length > 0) line.push(token);
      continue;
    }
    const candidate = [...line, token];
    if (line.length > 0 && measureSpans(candidate, size, faces, direction) > maxWidth) {
      lines.push(trimTrailingWhitespace(line));
      line = [token];
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) lines.push(trimTrailingWhitespace(line));

  return lines
    .map((candidate) => trimLeadingWhitespace(candidate))
    .filter((candidate) => candidate.length > 0);
}

/** Line count a span list would occupy, used to pre-measure block heights. */
export function countLines(
  spans: StyledSpan[],
  maxWidth: number,
  size: number,
  faces: Faces,
  direction: Direction,
): number {
  return Math.max(1, wrapSpans(spans, maxWidth, size, faces, direction).length);
}
