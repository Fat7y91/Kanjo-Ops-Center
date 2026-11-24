/**
 * Executive cover page for the contract document.
 *
 * A deep royal and warm-gold double frame holds a formal title sheet: the Kanjo
 * corporate line at the top, both parties' marks inside matching white cards, the
 * partnership title, the dual legal names, and a gold-bordered badge carrying the
 * contract reference and effective date. The cover is a `cover`-kind page, so it
 * is excluded from page numbering and page chrome.
 */

import type { PDFImage } from "pdf-lib";

import { PALETTE, TEXT, wrapSpans, type DocumentWriter } from "@/lib/pdf";

import { KANJO_FIRST_PARTY } from "../constants";
import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";

const WEBSITE = "kanjo.com.eg";
const FRAME_OUTER = 18;
const FRAME_INNER = 27;
const CORNER = 20;
const CONTENT = 60;

type Area = {
  left: number;
  right: number;
  width: number;
  centerX: number;
};

function drawFrame(writer: DocumentWriter): Area {
  const { canvas } = writer;
  const width = canvas.width;
  const height = canvas.height;

  canvas.box({ x: 0, y: 0, width, height }, { fill: PALETTE.white });
  canvas.box(
    {
      x: FRAME_OUTER,
      y: FRAME_OUTER,
      width: width - FRAME_OUTER * 2,
      height: height - FRAME_OUTER * 2,
    },
    { border: PALETTE.goldWarm, borderWidth: 2.4, radius: 2 },
  );
  canvas.box(
    {
      x: FRAME_INNER,
      y: FRAME_INNER,
      width: width - FRAME_INNER * 2,
      height: height - FRAME_INNER * 2,
    },
    { border: PALETTE.coverRoyal, borderWidth: 0.9, radius: 1 },
  );

  const inset = FRAME_INNER + 10;
  const corners = [
    { x: inset, y: height - inset - 3 },
    { x: width - inset - CORNER, y: height - inset - 3 },
    { x: inset, y: inset },
    { x: width - inset - CORNER, y: inset },
  ];
  for (const corner of corners) {
    canvas.box(
      { x: corner.x, y: corner.y, width: CORNER, height: 2.4 },
      { fill: PALETTE.goldWarm },
    );
  }

  return {
    left: CONTENT,
    right: width - CONTENT,
    width: width - CONTENT * 2,
    centerX: width / 2,
  };
}

function drawBrandLine(writer: DocumentWriter, area: Area): void {
  const { canvas } = writer;
  canvas.text([{ text: `شركة كاند جوو لخدمات التوصيل والتجارة الإلكترونية ذ.م.م  |  ${WEBSITE}`, bold: true }], {
    x: area.left,
    y: canvas.height - 66,
    size: 8.6,
    maxWidth: area.width,
    align: "center",
    direction: "rtl",
    color: PALETTE.royalDeep,
  });
  canvas.rule(area.left + 30, area.right - 30, canvas.height - 76, PALETTE.goldWarm, 1);
}

function drawCentered(
  writer: DocumentWriter,
  text: string,
  top: number,
  size: number,
  lineHeight: number,
  color: typeof PALETTE.ink,
  maxWidth = 470,
): number {
  const lines = wrapSpans([{ text, bold: true }], maxWidth, size, writer.fonts, "rtl");
  let y = top;
  for (const line of lines) {
    writer.canvas.text(line, {
      x: writer.canvas.width / 2 - maxWidth / 2,
      y: y - size,
      size,
      maxWidth,
      align: "center",
      direction: "rtl",
      color,
    });
    y -= lineHeight;
  }
  return y;
}

function drawLogoCard(
  writer: DocumentWriter,
  image: PDFImage | null,
  x: number,
  y: number,
  size: number,
  accent: typeof PALETTE.goldWarm,
): void {
  const { canvas } = writer;
  canvas.box(
    { x, y, width: size, height: size },
    { fill: PALETTE.white, border: accent, borderWidth: 1.4, radius: 10 },
  );
  if (!image) return;
  const pad = 16;
  canvas.page.drawImage(image, {
    x: x + pad,
    y: y + pad,
    width: size - pad * 2,
    height: size - pad * 2,
  });
}

function drawLogos(
  writer: DocumentWriter,
  kanjo: PDFImage | null,
  merchant: PDFImage | null,
  area: Area,
  top: number,
): void {
  const size = 138;
  const gap = 34;
  const y = top - size;

  if (merchant) {
    const total = size * 2 + gap;
    const leftX = area.centerX - total / 2;
    // RTL reading order: Kanjo on the right, the merchant on the left.
    drawLogoCard(writer, kanjo, leftX + size + gap, y, size, PALETTE.goldWarm);
    drawLogoCard(writer, merchant, leftX, y, size, PALETTE.purple);
    writer.canvas.text([{ text: "&", bold: true }], {
      x: area.centerX - 8,
      y: y + size / 2 - 8,
      size: 16,
      maxWidth: 16,
      align: "center",
      direction: "ltr",
      color: PALETTE.goldWarm,
    });
  } else {
    drawLogoCard(writer, kanjo, area.centerX - size / 2, y, size, PALETTE.goldWarm);
  }
}

function drawBadge(
  writer: DocumentWriter,
  area: Area,
  input: ContractDocumentInput,
  top: number,
): void {
  const { canvas } = writer;
  const height = 40;
  const width = 380;
  const x = area.centerX - width / 2;
  const y = top - height;

  canvas.box(
    { x, y, width, height },
    { fill: PALETTE.goldSoft, border: PALETTE.goldWarm, borderWidth: 1.2, radius: 20 },
  );

  const reference = input.reference || "—";
  const date = formatDate(input.effectiveDate);
  canvas.text(
    [
      { text: "رقم العقد: " },
      { text: `\u2066${reference}\u2069`, bold: true },
      { text: "  ·  تاريخ السريان: " },
      { text: date, bold: true },
    ],
    {
      x: x + 16,
      y: y + 13,
      size: 9.6,
      maxWidth: width - 32,
      align: "center",
      direction: "rtl",
      color: PALETTE.royalDeep,
    },
  );
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return toArabicNumerals(`${year}/${month}/${day}`);
}

/**
 * Draws the executive cover on the current (cover-kind) page.
 */
export function drawCover(
  writer: DocumentWriter,
  input: ContractDocumentInput,
  kanjo: PDFImage | null,
  merchant: PDFImage | null,
): void {
  const area = drawFrame(writer);
  drawBrandLine(writer, area);

  drawCentered(
    writer,
    "اتفاقية شراكة وتشغيل وتقديم خدمات توصيل",
    700,
    TEXT.coverTitle.size,
    TEXT.coverTitle.lineHeight,
    PALETTE.coverRoyal,
  );

  drawCentered(
    writer,
    `كانجو و ${input.merchantName}`,
    605,
    TEXT.coverName.size,
    TEXT.coverName.lineHeight,
    PALETTE.ink,
  );

  drawCentered(
    writer,
    `بين ${KANJO_FIRST_PARTY.tradeName} وبين ${input.legalName?.trim() || input.merchantName}`,
    555,
    10.4,
    16,
    PALETTE.inkSoft,
  );

  drawLogos(writer, kanjo, merchant, area, 498);
  drawBadge(writer, area, input, 326);

  writer.canvas.text([{ text: WEBSITE, bold: true }], {
    x: area.left,
    y: 40,
    size: 11,
    maxWidth: area.width,
    align: "center",
    direction: "ltr",
    color: PALETTE.goldDeep,
  });
}
