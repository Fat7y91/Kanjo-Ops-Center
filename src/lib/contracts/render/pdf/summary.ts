/**
 * Final summary and signature blocks for the contract document.
 *
 * The annex restates the commercial category and platform rate, flags a VIP
 * pre-contract state, lists commission exceptions, then sets the two signature
 * cards side by side. The whole block is reserved on one page so signatures never
 * split across a page break.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter } from "@/lib/pdf";

import { KANJO_FIRST_PARTY } from "../constants";
import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";
import { drawSectionHeading, headingHeight } from "./heading";

const FILL = "..........................";
const PAD = 12;
const CARD_GAP = 12;
const CARD_HEIGHT = 150;

function signatureCard(
  writer: DocumentWriter,
  x: number,
  top: number,
  width: number,
  title: string,
  nameLine: string,
  roleLine: string,
  signatureLine: string,
): void {
  const { canvas } = writer;
  canvas.box(
    { x, y: top - CARD_HEIGHT, width, height: CARD_HEIGHT },
    { fill: PALETTE.white, border: PALETTE.lineStrong, borderWidth: 1, radius: 6 },
  );
  canvas.box(
    { x, y: top - 3, width, height: 3 },
    { fill: PALETTE.gold, radius: 2 },
  );

  let cursor = top - 14;
  const titleLines = wrapSpans(
    [{ text: title, bold: true }],
    width - PAD * 2,
    TEXT.dense.size,
    writer.fonts,
    "rtl",
  );
  for (const line of titleLines) {
    canvas.text(line, {
      x: x + PAD,
      y: cursor - TEXT.dense.size,
      size: TEXT.dense.size,
      maxWidth: width - PAD * 2,
      align: "start",
      direction: "rtl",
      color: PALETTE.royal,
    });
    cursor -= TEXT.dense.lineHeight;
  }

  cursor -= 2;
  for (const line of [nameLine, roleLine]) {
    canvas.text([{ text: line }], {
      x: x + PAD,
      y: cursor - TEXT.dense.size,
      size: TEXT.dense.size,
      maxWidth: width - PAD * 2,
      align: "start",
      direction: "rtl",
      color: PALETTE.inkSoft,
    });
    cursor -= TEXT.dense.lineHeight;
  }

  const signY = top - CARD_HEIGHT + 40;
  canvas.dashedRule(x + PAD, x + width - PAD, signY, PALETTE.lineStrong, 0.8);
  canvas.text([{ text: signatureLine, bold: true }], {
    x: x + PAD,
    y: signY - TEXT.small.size - 2,
    size: TEXT.small.size,
    maxWidth: width - PAD * 2,
    align: "start",
    direction: "rtl",
    color: PALETTE.ink,
  });
  canvas.text([{ text: "الختم:" }], {
    x: x + PAD,
    y: top - CARD_HEIGHT + 8,
    size: TEXT.small.size,
    maxWidth: width - PAD * 2,
    align: "start",
    direction: "rtl",
    color: PALETTE.muted,
  });
}

/** Draws the final summary card and the two signature blocks. */
export function drawSummary(writer: DocumentWriter, input: ContractDocumentInput): void {
  const { canvas } = writer;
  const exceptions = input.exceptions ?? [];
  const displayRate = input.baseCommission !== null ? input.baseCommission : input.displayRate;
  const title = "ملحق مختصر: البيانات والتوقيعات النهائية";
  const innerWidth = writer.contentWidth - PAD * 2;

  let vipLines = 0;
  if (input.vipPreContract) {
    vipLines = wrapSpans(
      [
        {
          text: "حالة التعاقد: عرض مبدئي / تحت التعاقد (VIP) — هذا المستند عرض مبدئي غير نهائي ولا يترتب عليه أي التزام تعاقدي أو عمولة.",
        },
      ],
      innerWidth,
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
    ? wrapSpans([{ text: exceptionNote }], innerWidth, TEXT.dense.size, writer.fonts, "rtl").length
    : 0;

  const bodyH =
    TEXT.dense.lineHeight * 2 +
    8 +
    vipLines * TEXT.dense.lineHeight +
    (vipLines ? 10 : 0) +
    exceptionLines * TEXT.dense.lineHeight +
    (exceptionLines ? 6 : 0) +
    CARD_HEIGHT +
    PAD * 2;
  const height = headingHeight({ title }) + bodyH;

  if (writer.y - height < writer.floor) writer.addPage();
  drawSectionHeading(writer, { eyebrow: "ملحق", title });

  const top = writer.y;
  const bottom = top - bodyH;
  canvas.box(
    { x: writer.left, y: bottom, width: writer.contentWidth, height: bodyH },
    { fill: PALETTE.panel, border: PALETTE.line, borderWidth: 1, radius: 6 },
  );

  let cursor = top - PAD;
  canvas.text([{ text: "الفئة التجارية:", bold: true }], {
    x: writer.left + PAD,
    y: cursor - TEXT.dense.size,
    size: TEXT.dense.size,
    maxWidth: innerWidth,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });
  cursor -= TEXT.dense.lineHeight;
  canvas.text(
    [{ text: `${input.category}  |  نسبة مقابل خدمات المنصة: [ ${toArabicNumerals(displayRate)}% ]` }],
    {
      x: writer.left + PAD,
      y: cursor - TEXT.dense.size,
      size: TEXT.dense.size,
      maxWidth: innerWidth,
      align: "start",
      direction: "rtl",
      color: PALETTE.ink,
    },
  );
  cursor -= TEXT.dense.lineHeight + 8;

  if (vipLines > 0) {
    const lines = wrapSpans(
      [
        {
          text: "حالة التعاقد: عرض مبدئي / تحت التعاقد (VIP) — هذا المستند عرض مبدئي غير نهائي ولا يترتب عليه أي التزام تعاقدي أو عمولة.",
        },
      ],
      innerWidth,
      TEXT.dense.size,
      writer.fonts,
      "rtl",
    );
    canvas.box(
      { x: writer.left + PAD, y: cursor - vipLines * TEXT.dense.lineHeight - 6, width: innerWidth, height: vipLines * TEXT.dense.lineHeight + 6 },
      { fill: PALETTE.goldSoft, radius: 3 },
    );
    let baseline = cursor - 4 - TEXT.dense.size;
    for (const line of lines) {
      canvas.text(line, {
        x: writer.left + PAD + 8,
        y: baseline,
        size: TEXT.dense.size,
        maxWidth: innerWidth - 16,
        align: "start",
        direction: "rtl",
        color: PALETTE.warning,
      });
      baseline -= TEXT.dense.lineHeight;
    }
    cursor -= vipLines * TEXT.dense.lineHeight + 10;
  }

  if (exceptionLines > 0) {
    const lines = wrapSpans([{ text: exceptionNote }], innerWidth, TEXT.dense.size, writer.fonts, "rtl");
    for (const line of lines) {
      canvas.text(line, {
        x: writer.left + PAD,
        y: cursor - TEXT.dense.size,
        size: TEXT.dense.size,
        maxWidth: innerWidth,
        align: "start",
        direction: "rtl",
        color: PALETTE.ink,
      });
      cursor -= TEXT.dense.lineHeight;
    }
    cursor -= 6;
  }

  const cardWidth = (innerWidth - CARD_GAP) / 2;
  const cardsTop = Math.min(cursor, bottom + CARD_HEIGHT + PAD);
  const contactName = input.contactName || FILL;
  signatureCard(
    writer,
    writer.left + PAD,
    cardsTop,
    cardWidth,
    `الطرف الأول: ${KANJO_FIRST_PARTY.tradeName}`,
    "الاسم: م/ محمود الجمل",
    "الصفة: مدير التشغيل والتعاقدات",
    "توقيع المفوض:",
  );
  signatureCard(
    writer,
    writer.left + PAD + cardWidth + CARD_GAP,
    cardsTop,
    cardWidth,
    `الطرف الثاني: ${input.merchantName}`,
    `الاسم: ${contactName}`,
    "الصفة: صاحب النشاط",
    "توقيع صاحب النشاط:",
  );

  writer.commit(bodyH, 12);
}
