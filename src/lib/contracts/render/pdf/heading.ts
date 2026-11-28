/**
 * Headings for the contract document.
 *
 * Two visual grammars share one module:
 *   - section headings (appendix, preamble, signatures) use a soft purple plate
 *     with a gold spine on the reading-start edge;
 *   - clause headings are tighter and quieter: a slim purple accent bar on the
 *     right with the bold Cairo title beside it, so a page of clauses reads as
 *     legal prose rather than a stack of badges.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter } from "@/lib/pdf";

const PLATE_PAD_X = 12;
const PLATE_PAD_Y = 7;
const SPINE_WIDTH = 4;

const ACCENT_WIDTH = 4;
const ACCENT_INDENT = 14;
const CLAUSE_PAD_Y = 5;

export type HeadingOptions = {
  /** Optional short line above the title, e.g. "ملحق". */
  eyebrow?: string;
  /** Title text, already numbered when the caller wants the number inline. */
  title: string;
};

/** Height a {@link drawSectionHeading} block will occupy, for `ensure`. */
export function headingHeight(options: HeadingOptions): number {
  const eyebrow = options.eyebrow ? TEXT.small.lineHeight : 0;
  return eyebrow + TEXT.heading.lineHeight + PLATE_PAD_Y * 2;
}

/**
 * Draws a section heading at the cursor and advances it.
 *
 * The plate spans the full content width; the spine sits on the right (the RTL
 * start) so it reads as a margin marker, matching the printed originals.
 */
export function drawSectionHeading(
  writer: DocumentWriter,
  options: HeadingOptions,
): void {
  const { canvas } = writer;
  const height = headingHeight(options);
  const top = writer.y;
  const bottom = top - height;

  canvas.box(
    { x: writer.left, y: bottom, width: writer.contentWidth, height },
    { fill: PALETTE.purpleSoft, radius: 4 },
  );
  canvas.box(
    { x: writer.right - SPINE_WIDTH, y: bottom, width: SPINE_WIDTH, height },
    { fill: PALETTE.gold, radius: 2 },
  );

  let cursor = top - PLATE_PAD_Y;
  if (options.eyebrow) {
    canvas.text([{ text: options.eyebrow, bold: true }], {
      x: writer.left + PLATE_PAD_X,
      y: cursor - TEXT.small.size,
      size: TEXT.small.size,
      maxWidth: writer.contentWidth - PLATE_PAD_X * 2 - SPINE_WIDTH,
      align: "start",
      direction: "rtl",
      color: PALETTE.goldDeep,
    });
    cursor -= TEXT.small.lineHeight;
  }
  canvas.text([{ text: options.title, bold: true }], {
    x: writer.left + PLATE_PAD_X,
    y: cursor - TEXT.heading.size,
    size: TEXT.heading.size,
    maxWidth: writer.contentWidth - PLATE_PAD_X * 2 - SPINE_WIDTH,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });

  writer.commit(height, 8);
}

/** Wrapped lines of a clause title at the heading face. */
function clauseLines(writer: DocumentWriter, title: string) {
  return wrapSpans(
    [{ text: title, bold: true }],
    writer.contentWidth - ACCENT_INDENT - ACCENT_WIDTH,
    TEXT.heading.size,
    writer.fonts,
    "rtl",
  );
}

/** Height a clause heading will occupy, for `ensure` decisions. */
export function clauseHeadingHeight(writer: DocumentWriter, title: string): number {
  return clauseLines(writer, title).length * TEXT.heading.lineHeight + CLAUSE_PAD_Y * 2;
}

/**
 * Draws a clause title with a purple accent bar on the reading-start edge.
 *
 * No plate and no eyebrow: the number is already part of `title`, and the
 * absence of a badge keeps long legal pages calm.
 */
export function drawClauseHeading(writer: DocumentWriter, title: string): void {
  const { canvas } = writer;
  const lines = clauseLines(writer, title);
  const height = clauseHeadingHeight(writer, title);
  const top = writer.y;

  canvas.box(
    {
      x: writer.right - ACCENT_WIDTH,
      y: top - height,
      width: ACCENT_WIDTH,
      height,
    },
    { fill: PALETTE.purple, radius: 2 },
  );

  let cursor = top - CLAUSE_PAD_Y;
  for (const line of lines) {
    canvas.text(line, {
      x: writer.left,
      y: cursor - TEXT.heading.size,
      size: TEXT.heading.size,
      maxWidth: writer.contentWidth - ACCENT_INDENT,
      align: "start",
      direction: "rtl",
      color: PALETTE.royal,
    });
    cursor -= TEXT.heading.lineHeight;
  }

  writer.commit(height, 6);
}
