/**
 * Section headings for the contract document.
 *
 * Every title (clause, appendix, preamble, summary) uses the same visual
 * grammar: a soft purple plate with a gold spine on the reading-start edge and a
 * numbered/eyebrow line above the title. Keeping one builder here means the
 * whole document reads as one designed system rather than a set of look-alikes.
 */

import { PALETTE, TEXT, type DocumentWriter } from "@/lib/pdf";

const PLATE_PAD_X = 12;
const PLATE_PAD_Y = 7;
const SPINE_WIDTH = 4;

export type HeadingOptions = {
  /** Optional short line above the title, e.g. "البند الثالث". */
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
