/**
 * Per-page decorations for the contract PDF.
 *
 * Runs after every page is laid out, when the total page count is known. Draws
 * the faint Kanjo watermark, a slim header continuation rule on inner pages, and
 * the "صفحة X من Y" footer with Eastern-Arabic numerals.
 */

import { PALETTE, TEXT, type DocumentWriter, type PageHook } from "@/lib/pdf";
import type { PDFImage } from "pdf-lib";

import { contractDocumentTitle } from "../title";
import type { ContractDocumentInput } from "../input";
import { toArabicNumerals } from "../format";

const WATERMARK_SIZE = 300;

/**
 * Builds the page hook for a document.
 *
 * Page one skips the continuation rule (the masthead already fills the top).
 * The watermark is drawn on every page at very low opacity so the sheet reads as
 * Kanjo paperwork even if pages are separated.
 */
export function pageDecorations(
  watermark: PDFImage | null,
  input: ContractDocumentInput,
): PageHook {
  return (canvas, pageNumber, totalPages) => {
    const { page } = canvas;

    if (watermark) {
      const size = WATERMARK_SIZE;
      const x = (page.getWidth() - size) / 2;
      const y = (page.getHeight() - size) / 2 - 40;
      page.drawImage(watermark, { x, y, width: size, height: size, opacity: 0.045 });
    }

    if (pageNumber > 1) {
      const top = page.getHeight() - 40;
      canvas.rule(40, page.getWidth() - 40, top, PALETTE.lineStrong, 0.8);
      canvas.text([{ text: contractDocumentTitle(input), bold: true }], {
        x: 40,
        y: top - 14,
        size: TEXT.small.size,
        maxWidth: page.getWidth() - 80,
        align: "end",
        direction: "rtl",
        color: PALETTE.royal,
      });
    }

    const footerY = 30;
    canvas.rule(40, page.getWidth() - 40, footerY + 12, PALETTE.line, 0.8);
    canvas.text(
      [{ text: `صفحة ${toArabicNumerals(pageNumber)} من ${toArabicNumerals(totalPages)}` }],
      {
        x: 40,
        y: footerY,
        size: TEXT.small.size,
        maxWidth: page.getWidth() - 80,
        align: "center",
        direction: "rtl",
        color: PALETTE.royal,
      },
    );
    canvas.text([{ text: "KANJO" }], {
      x: 40,
      y: footerY,
      size: TEXT.small.size,
      maxWidth: page.getWidth() - 80,
      align: "start",
      direction: "ltr",
      color: PALETTE.muted,
    });
  };
}

/** Exposes the writer geometry type for the decorator's callers. */
export type { DocumentWriter };
