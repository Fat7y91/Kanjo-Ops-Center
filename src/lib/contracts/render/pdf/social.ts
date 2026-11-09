/**
 * Social handles, website and copyright for the contract document.
 *
 * These are Latin handles, so they are drawn left-to-right even though the page
 * is Arabic. The official website is included alongside the social handles, and
 * the copyright line is rendered with Arabic numerals for consistency with the
 * rest of the document.
 */

import { PALETTE, TEXT, measureWidth, type DocumentWriter } from "@/lib/pdf";

const CURRENT_YEAR_AR = "٢٠٢٦";
const WEBSITE = "kanjo.com.eg";
const HANDLES = ["facebook.com/kanjo.app.eg", "instagram.com/kanjo.app.eg", "tiktok.com/@kanjo.app.eg"];

/** Draws the website + social row and the copyright band. */
export function drawSocial(writer: DocumentWriter): void {
  const { canvas } = writer;
  const height = TEXT.small.lineHeight * 3 + 18;
  writer.ensure(height);
  const top = writer.y;

  canvas.rule(writer.left, writer.right, top, PALETTE.line, 0.8);

  // Website, on its own emphasised line.
  canvas.text([{ text: WEBSITE, bold: true }], {
    x: writer.left,
    y: top - 14 - TEXT.small.size,
    size: TEXT.small.size + 1,
    maxWidth: writer.contentWidth,
    align: "center",
    direction: "ltr",
    color: PALETTE.goldDeep,
  });

  // Evenly distributed social handles.
  const widths = HANDLES.map((handle) =>
    measureWidth(writer.fonts.regular, handle, TEXT.small.size),
  );
  const total = widths.reduce((sum, width) => sum + width, 0);
  const gap = (writer.contentWidth - total) / (HANDLES.length + 1);
  let x = writer.left + gap;
  const handleY = top - 14 - TEXT.small.size - TEXT.small.lineHeight - 2;
  HANDLES.forEach((handle, index) => {
    canvas.text([{ text: handle }], {
      x,
      y: handleY,
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
      y: handleY - TEXT.small.lineHeight - 4,
      size: TEXT.small.size,
      maxWidth: writer.contentWidth,
      align: "center",
      direction: "rtl",
      color: PALETTE.muted,
    },
  );

  writer.commit(height, 0);
}
