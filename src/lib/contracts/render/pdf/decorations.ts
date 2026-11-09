/**
 * Page decorations for the contract document.
 *
 * Drawn by the finish hook once every section has flowed onto pages. Content
 * pages get the running header, a faint watermark, the per-page signature footer
 * and the page strip (page number + website). Cover pages are skipped entirely so
 * the title sheet stays clean and unnumbered.
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

/** The two required signature lines plus their fill rules. */
function drawSignatureFooter(canvas: PageCanvas, input: ContractDocumentInput): void {
  const left = PAGE_MARGIN;
  const right = canvas.width - PAGE_MARGIN;
  const mid = left + (right - left) / 2;
  const merchant = input.merchantName || "الطرف الثاني";
  const labelY = 60;

  canvas.text([{ text: "توقيع الطرف الأول (كانجو)", bold: true }], {
    x: left,
    y: labelY,
    size: TEXT.small.size,
    maxWidth: mid - left - 10,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });
  canvas.text([{ text: `توقيع الطرف الثاني (${merchant})`, bold: true }], {
    x: mid + 10,
    y: labelY,
    size: TEXT.small.size,
    maxWidth: right - mid - 10,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });

  const lineY = labelY - 5;
  canvas.dashedRule(left, mid - 14, lineY, PALETTE.lineStrong, 0.8);
  canvas.dashedRule(mid + 6, right, lineY, PALETTE.lineStrong, 0.8);
}

/** Page number (centred), website (start) and merchant (end) at the very bottom. */
function drawPageStrip(
  canvas: PageCanvas,
  page: PageHookInfo,
  input: ContractDocumentInput,
): void {
  const left = PAGE_MARGIN;
  const right = canvas.width - PAGE_MARGIN;
  const width = right - left;
  const y = 24;

  canvas.rule(left, right, y + 12, PALETTE.line, 0.8);

  if (page.number !== null) {
    canvas.text(
      [{ text: `صفحة ${toArabicNumerals(page.number)} من ${toArabicNumerals(page.total)}`, bold: true }],
      {
        x: left + width / 3,
        y,
        size: TEXT.small.size,
        maxWidth: width / 3,
        align: "center",
        direction: "rtl",
        color: PALETTE.royal,
      },
    );
  }

  canvas.text([{ text: WEBSITE, bold: true }], {
    x: left,
    y,
    size: TEXT.small.size,
    maxWidth: width / 3,
    align: "start",
    direction: "ltr",
    color: PALETTE.goldDeep,
  });
  canvas.text([{ text: input.merchantName || "KANJO" }], {
    x: right - width / 3,
    y,
    size: TEXT.small.size,
    maxWidth: width / 3,
    align: "start",
    direction: "rtl",
    color: PALETTE.muted,
  });
}

/**
 * Builds the finish hook. Covers are skipped; content pages get header, a very
 * faint watermark for continuity, the signature footer and the page strip.
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

    drawRunningHeader(canvas, input, assets);
    drawSignatureFooter(canvas, input);
    drawPageStrip(canvas, page, input);
  };
}
