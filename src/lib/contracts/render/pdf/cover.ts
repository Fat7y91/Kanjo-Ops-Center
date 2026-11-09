/**
 * Cover page for the contract document.
 *
 * A full-bleed branded title sheet: a deep royal upper band carrying the
 * partnership statement, and a clean lower half that puts the Kanjo mark and the
 * official website front and centre. It is a `cover`-kind page, so the numbering
 * hook excludes it and the first clause page becomes "page 1". The cover carries
 * no header, signature footer or commission figures — it is a title sheet, not
 * contract body.
 */

import type { PDFImage } from "pdf-lib";

import { PALETTE, TEXT, type DocumentWriter } from "@/lib/pdf";

import type { ContractDocumentInput } from "../input";

const MARGIN = 52;
const WEBSITE = "kanjo.com.eg";

/** Fraction of the page height occupied by the royal title band. */
const BAND_RATIO = 0.46;

type Area = { left: number; right: number; width: number; centerX: number };

/**
 * Lays down the page: a deep royal upper band, a gold seam, a subtle inner
 * frame, and the royal footer band that anchors the website.
 */
function drawBackdrop(writer: DocumentWriter): Area {
  const { canvas } = writer;
  const width = canvas.width;
  const height = canvas.height;
  const bandBottom = height * BAND_RATIO;

  canvas.box({ x: 0, y: 0, width, height }, { fill: PALETTE.white });

  // Upper band: a royal base with a lighter inner seam for depth, plus a thin
  // gold seam that reads as a premium rule between the dark and light halves.
  canvas.box({ x: 0, y: bandBottom, width, height: height - bandBottom }, { fill: PALETTE.royalDeep });
  canvas.box({ x: 0, y: bandBottom - 3, width, height: 3 }, { fill: PALETTE.gold });

  // Footer band for the website, mirroring the top band for a framed page.
  const footerH = 66;
  canvas.box({ x: 0, y: 0, width, height: footerH }, { fill: PALETTE.royalDeep });
  canvas.box({ x: 0, y: footerH, width, height: 2.5 }, { fill: PALETTE.gold });

  // Fine inner frame on the white lower half for a finished, engraved feel.
  const inset = 24;
  canvas.box(
    {
      x: inset,
      y: footerH + 12,
      width: width - inset * 2,
      height: bandBottom - footerH - 24,
    },
    { border: PALETTE.lineStrong, borderWidth: 0.8 },
  );

  return {
    left: MARGIN,
    right: width - MARGIN,
    width: width - MARGIN * 2,
    centerX: width / 2,
  };
}

/** The partnership statement inside the royal band, vertically centred. */
function drawTitleBlock(
  writer: DocumentWriter,
  input: ContractDocumentInput,
  area: Area,
): void {
  const { canvas } = writer;
  const bandBottom = canvas.height * BAND_RATIO;

  // Lay the stack out with a downward cursor, then centre the whole block in the
  // band so it never floats at the top or sinks to the seam.
  const kickerSize = TEXT.coverKicker.size;
  const titleSize = TEXT.coverTitle.size;
  const kanjoSize = titleSize + 16;
  const wawSize = titleSize - 8;
  const nameSize = TEXT.coverName.size + 9;

  const stack: { text?: string; size: number; gap: number; color?: typeof PALETTE.white; ruleW?: number }[] = [
    { text: "اتفاقية شراكة وتشغيل", size: kickerSize, gap: 8, color: PALETTE.goldBright },
    { ruleW: 68, size: 2, gap: 30 },
    { text: "عقد اتفاق بين", size: titleSize, gap: 10, color: PALETTE.white },
    { text: "كانچو", size: kanjoSize, gap: 4, color: PALETTE.goldBright },
    { text: "و", size: wawSize, gap: 20, color: PALETTE.white },
    { text: input.merchantName, size: nameSize, gap: 12, color: PALETTE.white },
    { ruleW: 180, size: 2, gap: 0 },
  ];
  const totalH = stack.reduce((sum, item) => sum + item.size + item.gap, 0);

  let y = (canvas.height + bandBottom) / 2 + totalH / 2;
  for (const item of stack) {
    if (item.ruleW !== undefined) {
      canvas.box(
        { x: area.centerX - item.ruleW / 2, y: y - item.size, width: item.ruleW, height: item.size },
        { fill: PALETTE.gold },
      );
    } else {
      canvas.text([{ text: item.text!, bold: true }], {
        x: area.left,
        y: y - item.size,
        size: item.size,
        maxWidth: area.width,
        align: "center",
        direction: "rtl",
        color: item.color!,
      });
    }
    y -= item.size + item.gap;
  }
}

/** Kanjo + merchant marks on the clean lower half, side by side. */
function drawLogoBlock(
  writer: DocumentWriter,
  kanjo: PDFImage | null,
  merchant: PDFImage | null,
  area: Area,
): void {
  const { canvas } = writer;
  const bandBottom = canvas.height * BAND_RATIO;

  const logoSize = 132;
  const gap = merchant ? 96 : 0;
  const rowTop = bandBottom - 52;
  const logoY = rowTop - logoSize;

  if (merchant) {
    // Two marks flanking a small gold "partnership" divider, centred together.
    const totalW = logoSize * 2 + gap;
    const leftX = area.centerX - totalW / 2;
    const rightX = leftX + logoSize + gap;

    // Merchant logo on the reading-start (right) side, Kanjo on the left so the
    // pair mirrors the RTL reading order used throughout the document.
    canvas.page.drawImage(merchant, {
      x: rightX,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
    canvas.page.drawImage(kanjo ?? merchant, {
      x: leftX,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });

    // Small gold connector mark between the two logos.
    const dividerX = area.centerX;
    const dividerY = logoY + logoSize / 2;
    canvas.box(
      { x: dividerX - 1, y: dividerY - 16, width: 2, height: 32 },
      { fill: PALETTE.gold },
    );
  } else if (kanjo) {
    canvas.page.drawImage(kanjo, {
      x: area.centerX - logoSize / 2,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  }

  canvas.text([{ text: "KANJO", bold: true }], {
    x: area.left,
    y: logoY - 28,
    size: 17,
    maxWidth: area.width,
    align: "center",
    direction: "ltr",
    color: PALETTE.royal,
  });
  canvas.text([{ text: "منصة التوصيل والتجارة الإلكترونية" }], {
    x: area.left,
    y: logoY - 46,
    size: TEXT.coverMeta.size,
    maxWidth: area.width,
    align: "center",
    direction: "rtl",
    color: PALETTE.inkSoft,
  });
}

/** Website, centred in the royal footer band. */
function drawWebsite(writer: DocumentWriter, area: Area): void {
  const { canvas } = writer;
  canvas.text([{ text: WEBSITE, bold: true }], {
    x: area.left,
    y: 30,
    size: TEXT.coverMeta.size + 1.5,
    maxWidth: area.width,
    align: "center",
    direction: "ltr",
    color: PALETTE.goldBright,
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
  merchant: PDFImage | null,
): void {
  const area = drawBackdrop(writer);
  drawTitleBlock(writer, input, area);
  drawLogoBlock(writer, kanjo, merchant, area);
  drawWebsite(writer, area);
}
