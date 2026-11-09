/**
 * Final summary and signature blocks for the contract PDF.
 *
 * The "ملحق مختصر" restates the commercial category and platform rate, flags a
 * VIP pre-contract state when relevant, lists commission exceptions, then sets
 * the two signature cards side by side. The whole block is reserved on one page so
 * signatures never split across a page break.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter } from "@/lib/pdf";

import { KANJO_FIRST_PARTY } from "../constants";
import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";

const FILL = "..............................";

function summaryLine(writer: DocumentWriter, top: number, label: string, value: string): number {
  const { canvas } = writer;
  canvas.text([{ text: label, bold: true }], {
    x: writer.left + 12,
    y: top - TEXT.dense.size,
    size: TEXT.dense.size,
    maxWidth: writer.contentWidth - 24,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });
  canvas.text([{ text: value }], {
    x: writer.left + 12,
    y: top - TEXT.dense.size - TEXT.dense.lineHeight,
    size: TEXT.dense.size,
    maxWidth: writer.contentWidth - 24,
    align: "start",
    direction: "rtl",
    color: PALETTE.ink,
  });
  return top - TEXT.dense.lineHeight * 2 - 6;
}

function signatureCard(
  writer: DocumentWriter,
  x: number,
  top: number,
  width: number,
  height: number,
  title: string,
  nameLine: string,
  roleLine: string,
): void {
  const { canvas } = writer;
  canvas.box(
    { x, y: top - height, width, height },
    { fill: PALETTE.white, border: PALETTE.lineStrong, borderWidth: 1, radius: 5 },
  );
  let cursor = top - 12;
  const titleLines = wrapSpans([{ text: title, bold: true }], width - 20, TEXT.dense.size, writer.fonts, "rtl");
  for (const line of titleLines) {
    canvas.text(line, {
      x: x + 10,
      y: cursor - TEXT.dense.size,
      size: TEXT.dense.size,
      maxWidth: width - 20,
      align: "start",
      direction: "rtl",
      color: PALETTE.royal,
    });
    cursor -= TEXT.dense.lineHeight;
  }
  cursor -= 2;
  for (const line of [nameLine, roleLine]) {
    canvas.text([{ text: line }], {
      x: x + 10,
      y: cursor - TEXT.dense.size,
      size: TEXT.dense.size,
      maxWidth: width - 20,
      align: "start",
      direction: "rtl",
      color: PALETTE.inkSoft,
    });
    cursor -= TEXT.dense.lineHeight;
  }
  cursor -= 10;
  canvas.text([{ text: `توقيع المفوض: ${FILL}`, bold: true }], {
    x: x + 10,
    y: cursor - TEXT.dense.size,
    size: TEXT.dense.size,
    maxWidth: width - 20,
    align: "start",
    direction: "rtl",
    color: PALETTE.ink,
  });
  cursor -= TEXT.dense.lineHeight + 8;
  canvas.text([{ text: "الختم:", bold: true }], {
    x: x + 10,
    y: cursor - TEXT.dense.size,
    size: TEXT.dense.size,
    maxWidth: width - 20,
    align: "start",
    direction: "rtl",
    color: PALETTE.ink,
  });
  // A faint signature line anchors the bottom of the card.
  canvas.rule(x + 10, x + width - 10, top - height + 14, PALETTE.line, 0.8);
}

/** Draws the final summary card and the two signature blocks. */
export function drawSummary(writer: DocumentWriter, input: ContractDocumentInput): void {
  const { canvas } = writer;
  const exceptions = input.exceptions ?? [];
  const displayRate = input.baseCommission !== null ? input.baseCommission : input.displayRate;

  const innerPad = 12;
  const cardGap = 12;
  const cardWidth = (writer.contentWidth - innerPad * 2 - cardGap) / 2;
  const cardHeight = 172;

  let vipLines = 0;
  if (input.vipPreContract) {
    vipLines = wrapSpans(
      [
        {
          text: "حالة التعاقد: عرض مبدئي / تحت التعاقد (VIP) — هذا المستند عرض مبدئي غير نهائي ولا يترتب عليه أي التزام تعاقدي أو عمولة.",
        },
      ],
      writer.contentWidth - 24,
      TEXT.dense.size,
      writer.fonts,
      "rtl",
    ).length;
  }
  const exceptionNote = exceptions.length
    ? `استثناءات النسب: ${exceptions
        .map((ex) => `${ex.category}: [ ${toArabicNumerals(ex.rate)}% ]`)
        .join(" — ")}`
    : "";
  const exceptionLines = exceptionNote
    ? wrapSpans([{ text: exceptionNote }], writer.contentWidth - 24, TEXT.dense.size, writer.fonts, "rtl").length
    : 0;

  const height =
    TEXT.heading.lineHeight +
    12 +
    TEXT.dense.lineHeight * 2 +
    8 +
    vipLines * TEXT.dense.lineHeight +
    exceptionLines * TEXT.dense.lineHeight +
    cardHeight +
    16;

  writer.ensure(height);
  const top = writer.y;
  const bottom = top - height;

  canvas.box(
    { x: writer.left, y: bottom, width: writer.contentWidth, height },
    { fill: PALETTE.panel, border: PALETTE.line, borderWidth: 1, radius: 5 },
  );
  canvas.box(
    { x: writer.left + writer.contentWidth - 4, y: bottom, width: 4, height },
    { fill: PALETTE.gold },
  );
  canvas.text([{ text: "ملحق مختصر: البيانات والتوقيعات النهائية", bold: true }], {
    x: writer.left + 12,
    y: top - TEXT.heading.size - 8,
    size: TEXT.heading.size,
    maxWidth: writer.contentWidth - 24,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });

  let cursor = top - TEXT.heading.lineHeight - 6;
  cursor = summaryLine(
    writer,
    cursor,
    "الفئة التجارية:",
    `${input.category}  |  نسبة مقابل خدمات المنصة: [ ${toArabicNumerals(displayRate)}% ]`,
  );

  if (vipLines > 0) {
    const lines = wrapSpans(
      [
        {
          text: "حالة التعاقد: عرض مبدئي / تحت التعاقد (VIP) — هذا المستند عرض مبدئي غير نهائي ولا يترتب عليه أي التزام تعاقدي أو عمولة.",
        },
      ],
      writer.contentWidth - 24,
      TEXT.dense.size,
      writer.fonts,
      "rtl",
    );
    canvas.box(
      { x: writer.left + 12, y: cursor - vipLines * TEXT.dense.lineHeight - 6, width: writer.contentWidth - 24, height: vipLines * TEXT.dense.lineHeight + 6 },
      { fill: PALETTE.goldSoft, radius: 3 },
    );
    let baseline = cursor - 5 - TEXT.dense.size;
    for (const line of lines) {
      canvas.text(line, {
        x: writer.left + 20,
        y: baseline,
        size: TEXT.dense.size,
        maxWidth: writer.contentWidth - 40,
        align: "start",
        direction: "rtl",
        color: PALETTE.warning,
      });
      baseline -= TEXT.dense.lineHeight;
    }
    cursor -= vipLines * TEXT.dense.lineHeight + 10;
  }

  if (exceptionLines > 0) {
    const lines = wrapSpans([{ text: exceptionNote }], writer.contentWidth - 24, TEXT.dense.size, writer.fonts, "rtl");
    let baseline = cursor - TEXT.dense.size;
    for (const line of lines) {
      canvas.text(line, {
        x: writer.left + 12,
        y: baseline,
        size: TEXT.dense.size,
        maxWidth: writer.contentWidth - 24,
        align: "start",
        direction: "rtl",
        color: PALETTE.ink,
      });
      baseline -= TEXT.dense.lineHeight;
    }
    cursor = baseline - 4;
  }

  const cardsTop = Math.min(cursor, bottom + cardHeight + 14);
  const contactName = input.contactName || FILL;
  signatureCard(
    writer,
    writer.left + innerPad,
    cardsTop,
    cardWidth,
    cardHeight,
    `الطرف الأول: ${KANJO_FIRST_PARTY.tradeName}`,
    "الاسم: م/ محمود الجمل",
    "الصفة: مدير التشغيل والتعاقدات",
  );
  signatureCard(
    writer,
    writer.left + innerPad + cardWidth + cardGap,
    cardsTop,
    cardWidth,
    cardHeight,
    `الطرف الثاني: ${input.merchantName}`,
    `الاسم: ${contactName}`,
    "الصفة: صاحب النشاط",
  );

  writer.commit(height, 12);
}
