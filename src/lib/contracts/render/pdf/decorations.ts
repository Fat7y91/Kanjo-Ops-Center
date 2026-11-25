/**
 * Page decorations for the contract document.
 *
 * Drawn by the finish hook once every section has flowed onto pages. Content
 * pages get the running masthead, a very faint watermark and a single-line
 * footer that carries the corporate copyright, website and sequential page
 * counter inside the 22mm safe band. Covers are skipped entirely.
 */

import { PALETTE, TEXT } from "@/lib/pdf";
import type { PageCanvas, PageHook, PageHookInfo } from "@/lib/pdf";
import type { PDFImage } from "pdf-lib";

import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";
import { PAGE_MARGIN } from "./geometry";
import { drawRunningHeader, type ChromeAssets } from "./header";

const WATERMARK_SIZE = 300;
const WEBSITE = "kanjo.com.eg";
const LEGAL_NAME = "شركة كاند جوو لخدمات التوصيل والتجارة الإلكترونية";

function drawFooter(canvas: PageCanvas, page: PageHookInfo): void {
  const left = PAGE_MARGIN;
  const right = canvas.width - PAGE_MARGIN;
  const width = right - left;
  const y = 40;

  canvas.rule(left, right, y + 14, PALETTE.line, 0.8);

  if (page.number === null) return;

  // Isolate the copyright year and the website so bidi never merges the `©`
  // into the year or pushes the year to the far end of the line.
  const copyright =
    `${LEGAL_NAME} · ` +
    `\u2066© ${toArabicNumerals(2026)}\u2069 · \u2066${WEBSITE}\u2069`;
  canvas.text([{ text: copyright, bold: true }], {
    x: left,
    y,
    size: TEXT.small.size - 0.4,
    maxWidth: width,
    align: "start",
    direction: "rtl",
    color: PALETTE.muted,
  });

  // The page counter is a separate run anchored to the physical left, so the
  // total can never be clipped by the copyright line's width.
  const counter =
    `صفحة \u2066${toArabicNumerals(page.number)}\u2069 ` +
    `من \u2066${toArabicNumerals(page.total)}\u2069`;
  canvas.text([{ text: counter }], {
    x: left,
    y,
    size: TEXT.small.size - 0.4,
    maxWidth: width,
    align: "end",
    direction: "rtl",
    color: PALETTE.muted,
  });
}

/**
 * Builds the finish hook. Covers are skipped; content pages get the masthead,
 * a very faint watermark for continuity, and the single-line footer.
 */
export function pageDecorations(
  assets: ChromeAssets,
  input: ContractDocumentInput,
): PageHook {
  return (canvas, page) => {
    if (page.isCover) return;

    if (assets.kanjo) {
      const size = WATERMARK_SIZE;
      canvas.page.drawImage(assets.kanjo, {
        x: (canvas.width - size) / 2,
        y: (canvas.height - size) / 2 - 30,
        width: size,
        height: size,
        opacity: 0.04,
      });
    }

    drawRunningHeader(canvas, input);
    drawFooter(canvas, page);
  };
}
