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
const CARD_HEIGHT = 138;

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
  entity: string,
  person: string,
  role: string,
  tone: typeof PALETTE.royal,
): void {
  const { canvas } = writer;
  const inner = width - PAD * 2;
  canvas.box(
    { x, y: top - CARD_HEIGHT, width, height: CARD_HEIGHT },
    { fill: PALETTE.white, border: PALETTE.lineStrong, borderWidth: 1, radius: 6 },
  );
  canvas.box({ x, y: top - 4, width, height: 4 }, { fill: tone, radius: 2 });

  let cursor = top - PAD - 4;
  const headingLines = wrapSpans(
    [{ text: heading, bold: true }],
    inner,
    10.6,
    writer.fonts,
    "rtl",
  ).map((line) => line.map((span) => span.text).join(""));
  cursor = drawLines(writer, headingLines, x + PAD, cursor, inner, 10.6, 15, tone);

  const entityLines = wrapSpans(
    [{ text: entity }],
    inner,
    9.4,
    writer.fonts,
    "rtl",
  ).map((line) => line.map((span) => span.text).join(""));
  cursor = drawLines(
    writer,
    entityLines,
    x + PAD,
    cursor - 4,
    inner,
    9.4,
    14,
    PALETTE.ink,
  );

  cursor = drawLines(
    writer,
    [`الاسم: ${person}`, `الصفة: ${role}`],
    x + PAD,
    cursor - 2,
    inner,
    9.2,
    13.5,
    PALETTE.inkSoft,
  );

  const bottom = top - CARD_HEIGHT;
  const signY = bottom + 46;
  canvas.dashedRule(x + PAD, x + width - PAD, signY, PALETTE.lineStrong, 0.8);
  canvas.text([{ text: "التوقيع", bold: true }], {
    x: x + PAD,
    y: signY - 12,
    size: TEXT.small.size,
    maxWidth: inner,
    align: "start",
    direction: "rtl",
    color: PALETTE.muted,
  });

  const stampY = bottom + 20;
  canvas.dashedRule(x + PAD, x + width - PAD, stampY, PALETTE.lineStrong, 0.8);
  canvas.text([{ text: "الختم الرسمي", bold: true }], {
    x: x + PAD,
    y: stampY - 12,
    size: TEXT.small.size,
    maxWidth: inner,
    align: "start",
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

  const cardWidth = (innerWidth - CARD_GAP) / 2;
  const cardsTop = Math.min(cursor, bottom + CARD_HEIGHT + PAD);

  // RTL reading order: first party on the right, second party on the left.
  signatureCard(
    writer,
    writer.left + PAD + cardWidth + CARD_GAP,
    cardsTop,
    cardWidth,
    "الطرف الأول: شركة كاند جوو",
    KANJO_FIRST_PARTY.tradeName,
    "م/ محمود الجمل",
    "مدير التشغيل والتعاقدات",
    PALETTE.royal,
  );
  signatureCard(
    writer,
    writer.left + PAD,
    cardsTop,
    cardWidth,
    "الطرف الثاني: التاجر",
    input.legalName?.trim() || input.merchantName,
    input.legalRepresentativeName?.trim() || input.contactName || FILL,
    input.legalRepresentativeTitle?.trim() || "صاحب النشاط",
    PALETTE.goldDeep,
  );

  writer.commit(bodyH, 12);
}
