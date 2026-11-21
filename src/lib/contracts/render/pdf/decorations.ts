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

  // The two signature rules: second party on the left half, first party on the
  // right half. Labels are centred over their own rule.
  const leftRule = { x1: left, x2: mid - 14 };
  const rightRule = { x1: mid + 6, x2: right };

  // RTL reading order: the first party signs on the right (reading start), the
  // second party on the left.
  canvas.text([{ text: `توقيع الطرف الثاني (${merchant})`, bold: true }], {
    x: leftRule.x1,
    y: labelY,
    size: TEXT.small.size,
    maxWidth: leftRule.x2 - leftRule.x1,
    align: "center",
    direction: "rtl",
    color: PALETTE.royal,
  });
  canvas.text([{ text: "توقيع الطرف الأول (كانچو)", bold: true }], {
    x: rightRule.x1,
    y: labelY,
    size: TEXT.small.size,
    maxWidth: rightRule.x2 - rightRule.x1,
    align: "center",
    direction: "rtl",
    color: PALETTE.royal,
  });

  const lineY = labelY - 5;
  canvas.dashedRule(leftRule.x1, leftRule.x2, lineY, PALETTE.lineStrong, 0.8);
  canvas.dashedRule(rightRule.x1, rightRule.x2, lineY, PALETTE.lineStrong, 0.8);
}

/** Page number centred and the website at the start of the very bottom strip. */
function drawPageStrip(canvas: PageCanvas, page: PageHookInfo): void {
  const left = PAGE_MARGIN;
  const right = canvas.width - PAGE_MARGIN;
  const width = right - left;
  const y = 24;

  canvas.rule(left, right, y + 12, PALETTE.line, 0.8);

  if (page.number !== null) {
    canvas.text(
      [{ text: `صفحة ${toArabicNumerals(page.number)} من ${toArabicNumerals(page.total)}`, bold: true }],
      {
        x: left,
        y,
        size: TEXT.small.size,
        maxWidth: width,
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
    drawPageStrip(canvas, page);
  };
}
