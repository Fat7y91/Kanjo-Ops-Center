/**
 * Clause HTML parsing for the contract layout.
 *
 * The canonical legal copy in `data/clauses.ts` is authored as light HTML
 * (`<strong>`, `<br>`, and filler-rule `<div>`s) because V1 injected it into the
 * DOM. The PDF engine draws glyph runs, not markup, so this module turns a clause
 * body into styled text spans and counts the dashed fill rules it should draw
 * underneath.
 */

import type { StyledSpan } from "@/lib/pdf";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (match) => ENTITIES[match] ?? match);
}

/** A run of clause prose, or a hard line break. */
export type ClauseSegment = { text: string; bold: boolean } | { br: true };

/** Parses `<strong>`, `<br>` and stray tags into ordered inline segments. */
export function parseClauseInline(html: string): ClauseSegment[] {
  const segments: ClauseSegment[] = [];
  const pattern = /<strong>([\s\S]*?)<\/strong>|<br\s*\/?>|<[^>]+>/gi;
  let last = 0;
  let match: RegExpExecArray | null;

  const pushText = (raw: string, bold: boolean) => {
    if (!raw) return;
    const text = decodeEntities(raw).replace(/\s+/g, " ");
    if (text.trim()) segments.push({ text, bold });
  };

  while ((match = pattern.exec(html))) {
    pushText(html.slice(last, match.index), false);
    if (match[1] !== undefined) {
      pushText(match[1], true);
    } else if (/^<br/i.test(match[0])) {
      segments.push({ br: true });
    }
    last = pattern.lastIndex;
  }
  pushText(html.slice(last), false);
  return segments;
}

/** Counts the dashed filler rules in a clause body. */
export function countFillRules(html: string): number {
  return (html.match(/<div[^>]*border-bottom[^>]*>/gi) ?? []).length;
}

/** Strips all markup and collapses whitespace, for a plain-text view. */
export function clausePlainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converts inline segments into styled spans, splitting at line breaks.
 *
 * Returns one span list per visual line so the block layout can break pages
 * between author-authored `<br>` lines without splitting a sentence.
 */
export function segmentLines(html: string): StyledSpan[][] {
  const lines: StyledSpan[][] = [];
  let current: StyledSpan[] = [];
  for (const segment of parseClauseInline(html)) {
    if ("br" in segment) {
      if (current.length > 0) lines.push(current);
      current = [];
      continue;
    }
    current.push({ text: segment.text, bold: segment.bold });
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
