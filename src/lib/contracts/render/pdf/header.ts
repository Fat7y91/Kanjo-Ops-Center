/**
 * Running header for content pages of the contract document.
 *
 * A calm two-line masthead on the reading-start (right) edge: the platform
 * trade name and the second party's trade name, with the website on the left
 * and a hairline rule with a gold accent. The Arabic lines use the full content
 * width so they sit flush against the right margin instead of floating inward.
 */

import type { PDFImage } from "pdf-lib";

import { PALETTE, TEXT } from "@/lib/pdf";
import type { PageCanvas } from "@/lib/pdf";

import type { ContractDocumentInput } from "../input";
import { PAGE_MARGIN } from "./geometry";

export type ChromeAssets = {
  kanjo: PDFImage | null;
  merchant: PDFImage | null;
};

const WEBSITE = "kanjo.com.eg";
const TRADE_NAME = "كانچو — منصة التوصيل والتجارة الإلكترونية";

/** Draws the masthead at the top of a content page. */
export function drawRunningHeader(
  canvas: PageCanvas,
  input: ContractDocumentInput,
): void {
  const height = canvas.height;
  const left = PAGE_MARGIN;
  const right = canvas.width - PAGE_MARGIN;
  const width = right - left;
  const ruleY = height - 82;

  canvas.text([{ text: TRADE_NAME, bold: true }], {
    x: left,
    y: ruleY + 26,
    size: TEXT.small.size,
    maxWidth: width,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });
  canvas.text([{ text: `الطرف الثاني: ${input.merchantName}` }], {
    x: left,
    y: ruleY + 13,
    size: TEXT.small.size - 0.4,
    maxWidth: width,
    align: "start",
    direction: "rtl",
    color: PALETTE.goldDeep,
  });
  canvas.text([{ text: WEBSITE, bold: true }], {
    x: left,
    y: ruleY + 26,
    size: TEXT.small.size,
    maxWidth: width * 0.26,
    align: "start",
    direction: "ltr",
    color: PALETTE.goldDeep,
  });

  canvas.rule(left, right, ruleY, PALETTE.lineStrong, 1);
  canvas.box(
    { x: right - 72, y: ruleY - 1.4, width: 72, height: 2.8 },
    { fill: PALETTE.goldWarm },
  );
}
