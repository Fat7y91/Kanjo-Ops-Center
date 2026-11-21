/**
 * Running header for content pages of the contract document.
 *
 * The header is drawn by the finish hook on every numbered page: the Kanjo mark
 * on the reading-start (right) side, the merchant mark on the left, and the
 * contract title centred between them over a hairline rule with a gold accent.
 * Drawn as page chrome rather than flow content so it never displaces clauses.
 */

import type { PDFImage } from "pdf-lib";

import { PALETTE, TEXT } from "@/lib/pdf";
import type { PageCanvas } from "@/lib/pdf";

import type { ContractDocumentInput } from "../input";
import { contractDocumentTitle } from "../title";
import { PAGE_MARGIN } from "./geometry";

export type ChromeAssets = {
  kanjo: PDFImage | null;
  merchant: PDFImage | null;
};

const LOGO_SIZE = 40;
const MERCHANT_SIZE = 34;

/** Draws the two logos and centred title band at the top of a content page. */
export function drawRunningHeader(
  canvas: PageCanvas,
  input: ContractDocumentInput,
  assets: ChromeAssets,
): void {
  const height = canvas.height;
  const left = PAGE_MARGIN;
  const right = canvas.width - PAGE_MARGIN;
  const logoTop = height - 6;
  const logoY = logoTop - LOGO_SIZE;

  if (assets.kanjo) {
    canvas.page.drawImage(assets.kanjo, {
      x: right - LOGO_SIZE,
      y: logoY,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
    });
  }
  if (assets.merchant) {
    canvas.page.drawImage(assets.merchant, {
      x: left,
      y: logoY + (LOGO_SIZE - MERCHANT_SIZE) / 2,
      width: MERCHANT_SIZE,
      height: MERCHANT_SIZE,
    });
  }

  const innerLeft = left + (assets.merchant ? LOGO_SIZE : 0);
  const innerRight = right - (assets.kanjo ? LOGO_SIZE : 0);
  canvas.text([{ text: contractDocumentTitle(input), bold: true }], {
    x: innerLeft,
    y: logoY + LOGO_SIZE / 2 - TEXT.heading.size / 2 + 1,
    size: TEXT.heading.size,
    maxWidth: innerRight - innerLeft,
    align: "center",
    direction: "rtl",
    color: PALETTE.royal,
  });

  const ruleY = logoY - 8;
  canvas.rule(left, right, ruleY, PALETTE.lineStrong, 1);
  canvas.box(
    { x: right - 72, y: ruleY - 1.5, width: 72, height: 3 },
    { fill: PALETTE.gold },
  );
}
