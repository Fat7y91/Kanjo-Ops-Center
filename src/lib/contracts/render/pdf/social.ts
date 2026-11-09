/**
 * Social handles and copyright for the contract PDF.
 *
 * These are Latin handles, so they are drawn left-to-right even though the page
 * is Arabic. The copyright line is rendered with Arabic numerals for consistency
 * with the rest of the document.
 */

import { PALETTE, TEXT, type DocumentWriter } from "@/lib/pdf";

const CURRENT_YEAR_AR = "٢٠٢٦";
const HANDLES = ["facebook.com/kanjo.app.eg", "instagram.com/kanjo.app.eg", "tiktok.com/@kanjo.app.eg"];

/** Draws the social row and the copyright band. */
export function drawSocial(writer: DocumentWriter): void {
  const { canvas } = writer;
  const height = TEXT.small.lineHeight * 2 + 14;
  writer.ensure(height);
  const top = writer.y;
  canvas.rule(writer.left, writer.right, top, PALETTE.line, 0.8);

  let handleWidth = 0;
  const widths = HANDLES.map((handle) => {
    const width = measureHandle(handle);
    handleWidth += width;
    return width;
  });
  const gap = (writer.contentWidth - handleWidth) / (HANDLES.length + 1);
  let x = writer.left + gap;
  HANDLES.forEach((handle, index) => {
    canvas.text([{ text: handle, bold: true }], {
      x,
      y: top - 12 - TEXT.small.size,
      size: TEXT.small.size,
      maxWidth: widths[index]! + 4,
      align: "start",
      direction: "ltr",
      color: PALETTE.royal,
    });
    x += widths[index]! + gap;
  });

  canvas.text(
    [
      {
        text: `شركة كاند جوو لخدمات التوصيل والتجارة الإلكترونية — جميع الحقوق محفوظة © ${CURRENT_YEAR_AR}`,
      },
    ],
    {
      x: writer.left,
      y: top - 12 - TEXT.small.size - TEXT.small.lineHeight - 2,
      size: TEXT.small.size,
      maxWidth: writer.contentWidth,
      align: "center",
      direction: "rtl",
      color: PALETTE.muted,
    },
  );

  writer.commit(height, 0);
}

function measureHandle(handle: string): number {
  // Latin handles are LTR: measure by counting glyphs at a conservative width.
  // The canvas re-measures when drawing; this only distributes the row evenly.
  return handle.length * TEXT.small.size * 0.5;
}
