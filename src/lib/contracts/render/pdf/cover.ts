/**
 * Cover page for the contract document.
 *
 * A full-bleed branded cover that states the partnership and puts the Kanjo
 * mark prominently in the lower half. It is a `cover`-kind page, so the numbering
 * hook excludes it: the first clause page is "page 1". The cover carries no
 * header or signature footer, so it reads as a title sheet, not contract body.
 */

import type { PDFImage } from "pdf-lib";

import { PALETTE, TEXT, type DocumentWriter } from "@/lib/pdf";

import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";
import { contractDocumentTitle } from "../title";

const MARGIN = 48;
const WEBSITE = "kanjo.com.eg";

function drawBackdrop(writer: DocumentWriter): { left: number; right: number; width: number } {
  const { canvas } = writer;
  const width = canvas.width;
  const height = canvas.height;

  // A deep royal band across the top third anchors the title block.
  const bandH = height * 0.42;
  canvas.page.drawRectangle({
    x: 0,
    y: height - bandH,
    width,
    height: bandH,
    color: PALETTE.royalDeep,
  });
  canvas.page.drawRectangle({
    x: 0,
    y: height - bandH - 4,
    width,
    height: 4,
    color: PALETTE.gold,
  });

  // A faint gold frame inset from the page edge gives the sheet a finishing edge.
  const inset = 22;
  canvas.page.drawRectangle({
    x: inset,
    y: inset,
    width: width - inset * 2,
    height: height - inset * 2,
    borderColor: PALETTE.lineStrong,
    borderWidth: 1,
  });

  return { left: MARGIN, right: width - MARGIN, width: width - MARGIN * 2 };
}

function drawTitleBlock(
  writer: DocumentWriter,
  input: ContractDocumentInput,
  area: { left: number; right: number; width: number },
): void {
  const { canvas } = writer;
  const height = canvas.height;
  const centerX = area.left + area.width / 2;

  canvas.text([{ text: "اتفاقية شراكة وتشغيل", bold: true }], {
    x: area.left,
    y: height - 96,
    size: TEXT.coverKicker.size,
    maxWidth: area.width,
    align: "center",
    direction: "rtl",
    color: PALETTE.goldBright,
  });

  canvas.text([{ text: "عقد اتفاق بين", bold: true }], {
    x: area.left,
    y: height - 168,
    size: TEXT.coverTitle.size,
    maxWidth: area.width,
    align: "center",
    direction: "rtl",
    color: PALETTE.white,
  });
  canvas.text([{ text: "كانجو", bold: true }], {
    x: area.left,
    y: height - 214,
    size: TEXT.coverTitle.size + 4,
    maxWidth: area.width,
    align: "center",
    direction: "rtl",
    color: PALETTE.goldBright,
  });
  canvas.text([{ text: "و", bold: true }], {
    x: area.left,
    y: height - 250,
    size: TEXT.coverTitle.size - 2,
    maxWidth: area.width,
    align: "center",
    direction: "rtl",
    color: PALETTE.white,
  });

  // Merchant name on a solid white plate: high contrast over the dark band and
  // the single strongest identifier on the cover.
  const plateW = Math.min(area.width, 420);
  const plateX = centerX - plateW / 2;
  const plateH = 56;
  const nameTop = height - 286;
  canvas.box(
    { x: plateX, y: nameTop - plateH, width: plateW, height: plateH },
    { fill: PALETTE.white, radius: 8 },
  );
  canvas.text([{ text: input.merchantName, bold: true }], {
    x: plateX + 12,
    y: nameTop - plateH / 2 - TEXT.coverName.size / 2 + 2,
    size: TEXT.coverName.size,
    maxWidth: plateW - 24,
    align: "center",
    direction: "rtl",
    color: PALETTE.royal,
  });
}

function drawLogoBlock(
  writer: DocumentWriter,
  kanjo: PDFImage | null,
  area: { left: number; right: number; width: number },
): void {
  const { canvas } = writer;
  const centerX = area.left + area.width / 2;

  // Anchor the mark clearly below the dark band so it never clips the gold edge.
  const bandBottom = canvas.height * 0.58;
  const logoSize = 172;
  const logoY = bandBottom - 44 - logoSize;
  if (kanjo) {
    canvas.page.drawImage(kanjo, {
      x: centerX - logoSize / 2,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  }

  canvas.text([{ text: "KANJO", bold: true }], {
    x: area.left,
    y: logoY - 30,
    size: 20,
    maxWidth: area.width,
    align: "center",
    direction: "ltr",
    color: PALETTE.royal,
  });
  canvas.text([{ text: "منصة التوصيل والتجارة الإلكترونية" }], {
    x: area.left,
    y: logoY - 48,
    size: TEXT.coverMeta.size,
    maxWidth: area.width,
    align: "center",
    direction: "rtl",
    color: PALETTE.inkSoft,
  });

  // A short gold divider between the mark and the metadata footer.
  const ruleY = logoY - 70;
  canvas.box(
    { x: centerX - 40, y: ruleY, width: 80, height: 2.5 },
    { fill: PALETTE.gold },
  );
}

function drawCoverMeta(
  writer: DocumentWriter,
  input: ContractDocumentInput,
  area: { left: number; right: number; width: number },
): void {
  const { canvas } = writer;
  const y = 96;

  const rate =
    input.baseCommission !== null ? input.baseCommission : input.displayRate;

  canvas.text([{ text: contractDocumentTitle(input) }], {
    x: area.left,
    y: y + 34,
    size: TEXT.coverMeta.size,
    maxWidth: area.width,
    align: "center",
    direction: "rtl",
    color: PALETTE.royal,
  });
  canvas.text(
    [{ text: `نسبة مقابل خدمات المنصة: ${toArabicNumerals(rate)}%` }],
    {
      x: area.left,
      y: y + 16,
      size: TEXT.coverMeta.size,
      maxWidth: area.width,
      align: "center",
      direction: "rtl",
      color: PALETTE.inkSoft,
    },
  );

  canvas.rule(area.left + 80, area.right - 80, y - 2, PALETTE.line, 0.8);
  canvas.text([{ text: WEBSITE, bold: true }], {
    x: area.left,
    y: y - 20,
    size: TEXT.coverMeta.size,
    maxWidth: area.width,
    align: "center",
    direction: "ltr",
    color: PALETTE.goldDeep,
  });
}

/**
 * Draws the cover on the current (cover-kind) page.
 *
 * The writer's cursor is not advanced meaningfully here; the caller starts the
 * first content page explicitly so clause flow begins on a fresh sheet.
 */
export function drawCover(
  writer: DocumentWriter,
  input: ContractDocumentInput,
  kanjo: PDFImage | null,
): void {
  const area = drawBackdrop(writer);
  drawTitleBlock(writer, input, area);
  drawLogoBlock(writer, kanjo, area);
  drawCoverMeta(writer, input, area);
}
