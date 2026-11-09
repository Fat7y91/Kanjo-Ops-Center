/**
 * Document header for the contract PDF.
 *
 * A purple band carrying the Kanjo mark and the contract title, with the merchant
 * logo on the opposite side when one is available. The band reads as a masthead on
 * page one; inner pages get a slimmer continuation rule drawn by the page hook.
 */

import type { PDFImage } from "pdf-lib";

import { PALETTE, TEXT, type DocumentWriter } from "@/lib/pdf";
import { KANJO_FIRST_PARTY } from "../constants";
import { contractDocumentTitle } from "../title";
import type { ContractDocumentInput } from "../input";

const BAND_HEIGHT = 78;
const LOGO_SIZE = 50;

export type HeaderAssets = {
  kanjo: PDFImage | null;
  merchant: PDFImage | null;
};

/** Draws the masthead band at the top of the current page. */
export function drawHeader(
  writer: DocumentWriter,
  input: ContractDocumentInput,
  assets: HeaderAssets,
): void {
  const { canvas } = writer;
  const { left, right, contentWidth } = writer;
  const top = canvas.height - writer.geometry.marginTop;
  const bandBottom = top - BAND_HEIGHT;

  const band = { x: left, y: bandBottom, width: contentWidth, height: BAND_HEIGHT };
  canvas.box(band, { fill: PALETTE.royal, radius: 2 });
  // A gold hairline under the band gives the masthead a printed, finished edge.
  canvas.box(
    { x: left, y: bandBottom - 3, width: contentWidth, height: 3 },
    { fill: PALETTE.gold },
  );

  const logoY = bandBottom + (BAND_HEIGHT - LOGO_SIZE) / 2;
  if (assets.kanjo) {
    canvas.page.drawImage(assets.kanjo, {
      x: right - LOGO_SIZE - 12,
      y: logoY,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
    });
  }

  const titleSpans = [{ text: contractDocumentTitle(input) }];
  const textTop = bandBottom + BAND_HEIGHT - 20;
  canvas.text(titleSpans, {
    x: left + 16,
    y: textTop,
    size: TEXT.heading.size + 1,
    maxWidth: contentWidth - LOGO_SIZE - 40,
    align: "end",
    direction: "rtl",
    color: PALETTE.white,
  });
  canvas.text([{ text: KANJO_FIRST_PARTY.tradeName }], {
    x: left + 16,
    y: textTop - 20,
    size: TEXT.small.size,
    maxWidth: contentWidth - LOGO_SIZE - 40,
    align: "end",
    direction: "rtl",
    color: PALETTE.goldBright,
  });

  if (assets.merchant) {
    const size = Math.min(LOGO_SIZE, 44);
    canvas.page.drawImage(assets.merchant, {
      x: left + 12,
      y: bandBottom + (BAND_HEIGHT - size) / 2,
      width: size,
      height: size,
    });
  }

  writer.y = bandBottom - 18;
}
