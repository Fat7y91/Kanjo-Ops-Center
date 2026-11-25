/**
 * Final summary and formal signature block for the contract document.
 *
 * The annex restates the commercial category and platform rate, flags a VIP
 * pre-contract state, lists commission exceptions, then sets two spacious
 * signature cards side by side. Each card reserves dedicated white space for a
 * physical signature and corporate stamp, and the whole block is kept on one
 * page so signatures never split.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter } from "@/lib/pdf";

import { KANJO_FIRST_PARTY } from "../constants";
import type { ContractDocumentInput } from "../input";
import { percentageLabel } from "./clauses";
import { drawSectionHeading, headingHeight } from "./heading";

const FILL = "..........................";
const PAD = 12;
const CARD_GAP = 12;
const CARD_HEIGHT = 205;
const CARD_HEADER = 40;
const SIGN_GRID_HEIGHT = 65;

function drawLines(
  writer: DocumentWriter,
  lines: string[],
  x: number,
  top: number,
  width: number,
  size: number,
  lineHeight: number,
  color: typeof PALETTE.ink,
): number {
  let cursor = top;
  for (const line of lines) {
    writer.canvas.text([{ text: line }], {
      x,
      y: cursor - size,
      size,
      maxWidth: width,
      align: "start",
      direction: "rtl",
      color,
    });
    cursor -= lineHeight;
  }
  return cursor;
}

function signatureCard(
  writer: DocumentWriter,
  x: number,
  top: number,
  width: number,
  heading: string,
  headerFill: typeof PALETTE.signatureFirst,
  tone: typeof PALETTE.royal,
  entity: string,
  person: string,
  role: string,
): void {
  const { canvas } = writer;
  const inner = width - PAD * 2;
  const bottom = top - CARD_HEIGHT;

  canvas.box(
    { x, y: bottom, width, height: CARD_HEIGHT },
    { fill: PALETTE.white, border: PALETTE.lineStrong, borderWidth: 1, radius: 6 },
  );
  canvas.box(
    { x: x + 1, y: top - CARD_HEADER, width: width - 2, height: CARD_HEADER - 1 },
    { fill: headerFill },
  );
  canvas.page.drawLine({
    start: { x, y: top - CARD_HEADER },
    end: { x: x + width, y: top - CARD_HEADER },
    thickness: 0.8,
    color: PALETTE.lineStrong,
  });

  let headerY = top - 12;
  const headingLines = wrapSpans(
    [{ text: heading, bold: true }],
    inner - 8,
    10.2,
    writer.fonts,
    "rtl",
  ).map((line) => line.map((span) => span.text).join(""));
  for (const line of headingLines) {
    canvas.text([{ text: line, bold: true }], {
      x: x + PAD + 4,
      y: headerY - 10.2,
      size: 10.2,
      maxWidth: inner - 8,
      align: "start",
      direction: "rtl",
      color: tone,
    });
    headerY -= 13.2;
  }

  let cursor = top - CARD_HEADER - 12;
  const rows: [string, string][] = [
    ["الكيان القانوني", entity || "—"],
    ["المفوض بالتوقيع", person || "—"],
    ["الصفة", role || "—"],
  ];
  for (const [label, value] of rows) {
    const lines = wrapSpans(
      [{ text: `${label}: `, bold: true }, { text: value }],
      inner,
      9.2,
      writer.fonts,
      "rtl",
    );
    for (const line of lines) {
      canvas.text(line, {
        x: x + PAD,
        y: cursor - 9.2,
        size: 9.2,
        maxWidth: inner,
        align: "start",
        direction: "rtl",
        color: PALETTE.inkSoft,
      });
      cursor -= 13.4;
    }
    cursor -= 2;
  }

  const gridBottom = bottom + PAD;
  const gridTop = gridBottom + SIGN_GRID_HEIGHT;
  const half = inner / 2;
  canvas.box(
    { x: x + PAD, y: gridBottom, width: inner, height: SIGN_GRID_HEIGHT },
    { border: PALETTE.lineStrong, borderWidth: 0.8 },
  );
  canvas.page.drawLine({
    start: { x: x + PAD + half, y: gridBottom },
    end: { x: x + PAD + half, y: gridTop },
    thickness: 0.8,
    color: PALETTE.lineStrong,
  });
  canvas.text([{ text: "التوقيع", bold: true }], {
    x: x + PAD + half + 6,
    y: gridTop - 13,
    size: 8.2,
    maxWidth: half - 12,
    align: "center",
    direction: "rtl",
    color: PALETTE.muted,
  });
  canvas.text([{ text: "الختم الرسمي", bold: true }], {
    x: x + PAD,
    y: gridTop - 13,
    size: 8.2,
    maxWidth: half - 12,
    align: "center",
    direction: "rtl",
    color: PALETTE.muted,
  });
}

/** Draws the final summary card and the two signature cards. */
export function drawSummary(writer: DocumentWriter, input: ContractDocumentInput): void {
  const exceptions = input.exceptions ?? [];
  const displayRate =
    input.baseCommission !== null ? input.baseCommission : input.displayRate;
  const title = "ملحق التوقيعات والاعتماد النهائي";
  const innerWidth = writer.contentWidth - PAD * 2;

  const vipText =
    "حالة التعاقد: عرض مبدئي / تحت التعاقد (VIP) — هذا المستند عرض مبدئي غير نهائي ولا يترتب عليه أي التزام تعاقدي أو عمولة.";
  const vipLines = input.vipPreContract
    ? wrapSpans([{ text: vipText }], innerWidth, TEXT.dense.size, writer.fonts, "rtl").map(
        (line) => line.map((span) => span.text).join(""),
      )
    : [];

  const exceptionNote = exceptions.length
    ? `استثناءات النسب: ${exceptions
        .map((ex) => `${ex.category}: ${percentageLabel(ex.rate)}`)
        .join(" — ")}`
    : "";
  const exceptionLines = exceptionNote
    ? wrapSpans([{ text: exceptionNote }], innerWidth, TEXT.dense.size, writer.fonts, "rtl").map(
        (line) => line.map((span) => span.text).join(""),
      )
    : [];

  const summaryText = input.summaryNote?.trim() ?? "";
  const summaryLines = summaryText
    ? wrapSpans([{ text: summaryText }], innerWidth, TEXT.dense.size, writer.fonts, "rtl").map(
        (line) => line.map((span) => span.text).join(""),
      )
    : [];

  const bodyH =
    TEXT.dense.lineHeight * 2 +
    10 +
    vipLines.length * TEXT.dense.lineHeight +
    (vipLines.length ? 8 : 0) +
    exceptionLines.length * TEXT.dense.lineHeight +
    (exceptionLines.length ? 8 : 0) +
    summaryLines.length * TEXT.dense.lineHeight +
    (summaryLines.length ? 8 : 0) +
    CARD_HEIGHT +
    PAD * 2;
  const height = headingHeight({ title }) + bodyH;

  if (writer.y - height < writer.floor) writer.addPage();
  drawSectionHeading(writer, { eyebrow: "ملحق", title });

  const { canvas } = writer;
  const top = writer.y;
  const bottom = top - bodyH;
  canvas.box(
    { x: writer.left, y: bottom, width: writer.contentWidth, height: bodyH },
    { fill: PALETTE.panel, border: PALETTE.line, borderWidth: 1, radius: 6 },
  );

  let cursor = top - PAD;
  cursor = drawLines(
    writer,
    ["الفئة التجارية:", `${input.category}  |  نسبة مقابل خدمات المنصة: ${percentageLabel(displayRate)}`],
    writer.left + PAD,
    cursor,
    innerWidth,
    TEXT.dense.size,
    TEXT.dense.lineHeight,
    PALETTE.royal,
  );

  if (vipLines.length) {
    canvas.box(
      {
        x: writer.left + PAD,
        y: cursor - vipLines.length * TEXT.dense.lineHeight - 6,
        width: innerWidth,
        height: vipLines.length * TEXT.dense.lineHeight + 6,
      },
      { fill: PALETTE.goldSoft, radius: 3 },
    );
    cursor = drawLines(
      writer,
      vipLines,
      writer.left + PAD + 8,
      cursor - 4,
      innerWidth - 16,
      TEXT.dense.size,
      TEXT.dense.lineHeight,
      PALETTE.warning,
    );
    cursor -= 8;
  }

  if (exceptionLines.length) {
    cursor = drawLines(
      writer,
      exceptionLines,
      writer.left + PAD,
      cursor,
      innerWidth,
      TEXT.dense.size,
      TEXT.dense.lineHeight,
      PALETTE.ink,
    );
    cursor -= 8;
  }

  if (summaryLines.length) {
    cursor = drawLines(
      writer,
      summaryLines,
      writer.left + PAD,
      cursor,
      innerWidth,
      TEXT.dense.size,
      TEXT.dense.lineHeight,
      PALETTE.inkSoft,
    );
    cursor -= 8;
  }

  const legalName = input.legalName?.trim() ?? "";
  const secondPartyTitle = legalName
    ? `الطرف الثاني: ${legalName} (${input.merchantName})`
    : `الطرف الثاني: ${input.merchantName}`;
  const cardWidth = (innerWidth - CARD_GAP) / 2;
  const cardsTop = Math.min(cursor, bottom + CARD_HEIGHT + PAD);

  // RTL reading order: first party on the right, second party on the left.
  signatureCard(
    writer,
    writer.left + PAD + cardWidth + CARD_GAP,
    cardsTop,
    cardWidth,
    "الطرف الأول: شركة كاند جوو",
    PALETTE.signatureFirst,
    PALETTE.royal,
    KANJO_FIRST_PARTY.tradeName,
    "م/ محمود الجمل",
    "مدير التشغيل والتعاقدات",
  );
  signatureCard(
    writer,
    writer.left + PAD,
    cardsTop,
    cardWidth,
    secondPartyTitle,
    PALETTE.signatureSecond,
    PALETTE.goldDeep,
    input.legalName?.trim() || input.merchantName,
    input.legalRepresentativeName?.trim() || input.contactName || FILL,
    input.legalRepresentativeTitle?.trim() || "صاحب النشاط",
  );

  writer.commit(bodyH, 12);
}
