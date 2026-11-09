/**
 * Parties section for the contract document.
 *
 * The date preamble plus two identification panels: the first party is Kanjo's
 * fixed registration data, the second is the merchant. Each panel is a soft card
 * with a coloured spine on the reading-start edge and a labelled header band, so
 * the two parties read as a matched pair. The merchant panel lists the identity
 * fields the printed contract leaves for handwriting when data is missing.
 */

import { PALETTE, TEXT, type DocumentWriter } from "@/lib/pdf";

import { KANJO_FIRST_PARTY } from "../constants";
import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";

const FILL = "................................";
const LABEL_WIDTH_RATIO = 0.4;
const PANEL_PAD = 14;
const SPINE_WIDTH = 4;

export type PanelTone = "royal" | "gold";

/** Draws a titled card and reserves its height on the cursor. */
function panel(
  writer: DocumentWriter,
  tone: PanelTone,
  title: string,
  subtitle: string | null,
  estimate: number,
  body: (top: number) => void,
): void {
  writer.ensure(estimate);
  const { canvas } = writer;
  const top = writer.y;
  const bottom = top - estimate;
  const x = writer.left;
  const width = writer.contentWidth;
  const spine = tone === "royal" ? PALETTE.royal : PALETTE.gold;

  canvas.box(
    { x, y: bottom, width, height: estimate },
    { fill: PALETTE.panel, border: PALETTE.line, borderWidth: 1, radius: 6 },
  );
  canvas.box(
    { x: x + width - SPINE_WIDTH, y: bottom, width: SPINE_WIDTH, height: estimate },
    { fill: spine, radius: 2 },
  );

  let cursor = top - PANEL_PAD;
  canvas.text([{ text: title, bold: true }], {
    x: x + PANEL_PAD,
    y: cursor - TEXT.heading.size,
    size: TEXT.heading.size,
    maxWidth: width - PANEL_PAD * 2 - SPINE_WIDTH,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });
  cursor -= TEXT.heading.lineHeight;
  if (subtitle) {
    canvas.text([{ text: subtitle }], {
      x: x + PANEL_PAD,
      y: cursor - TEXT.dense.size,
      size: TEXT.dense.size,
      maxWidth: width - PANEL_PAD * 2 - SPINE_WIDTH,
      align: "start",
      direction: "rtl",
      color: PALETTE.inkSoft,
    });
    cursor -= TEXT.dense.lineHeight;
  }
  canvas.rule(
    x + PANEL_PAD,
    x + width - PANEL_PAD - SPINE_WIDTH,
    cursor - 4,
    PALETTE.line,
    0.8,
  );
  body(cursor - 12);
  writer.commit(estimate, 14);
}

function datePreamble(writer: DocumentWriter): void {
  writer.ensure(34);
  const { canvas } = writer;
  const top = writer.y;
  canvas.text(
    [
      {
        text: "إنه في يوم: ............................ الموافق: ...... / ...... / ............ م، تم الاتفاق والتراضي بين كل من:",
      },
    ],
    {
      x: writer.left,
      y: top - TEXT.body.size,
      size: TEXT.body.size,
      maxWidth: writer.contentWidth,
      align: "start",
      direction: "rtl",
      color: PALETTE.inkSoft,
    },
  );
  writer.commit(TEXT.body.size + 10, 14);
}

function fieldRow(writer: DocumentWriter, top: number, label: string, value: string): void {
  const { canvas } = writer;
  const size = TEXT.dense.size;
  const innerLeft = writer.left + PANEL_PAD;
  const innerRight = writer.left + writer.contentWidth - PANEL_PAD - SPINE_WIDTH;
  const innerWidth = innerRight - innerLeft;
  const labelWidth = innerWidth * LABEL_WIDTH_RATIO;
  const gap = 10;

  // RTL reading order: the label sits at the far-right (reading start) and the
  // value occupies the space to its left, right-aligned against the label.
  const labelX = innerRight - labelWidth;
  canvas.text([{ text: label }], {
    x: labelX,
    y: top - size,
    size,
    maxWidth: labelWidth,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });
  canvas.text([{ text: value }], {
    x: innerLeft,
    y: top - size,
    size,
    maxWidth: innerWidth - labelWidth - gap,
    align: "start",
    direction: "rtl",
    color: PALETTE.ink,
  });
}

function firstParty(writer: DocumentWriter): void {
  const rows = [
    `السجل التجاري رقم (${KANJO_FIRST_PARTY.commercialRegister}) — ${KANJO_FIRST_PARTY.commercialRegisterOffice}`,
    `البطاقة الضريبية رقم (${KANJO_FIRST_PARTY.taxCard}) — ${KANJO_FIRST_PARTY.taxOffice}`,
    `المقر: ${KANJO_FIRST_PARTY.address}`,
    "ويمثلها م/ محمود الجمل بصفته مدير التشغيل والتعاقدات.",
  ];
  const estimate =
    PANEL_PAD + TEXT.heading.lineHeight + TEXT.dense.lineHeight + 16 + rows.length * TEXT.dense.lineHeight + PANEL_PAD;

  panel(
    writer,
    "royal",
    "الطرف الأول: كانجو",
    KANJO_FIRST_PARTY.tradeName,
    estimate,
    (top) => {
      const { canvas } = writer;
      let cursor = top;
      for (const row of rows) {
        canvas.text([{ text: row }], {
          x: writer.left + PANEL_PAD,
          y: cursor - TEXT.dense.size,
          size: TEXT.dense.size,
          maxWidth: writer.contentWidth - PANEL_PAD * 2 - SPINE_WIDTH,
          align: "start",
          direction: "rtl",
          color: PALETTE.inkSoft,
        });
        cursor -= TEXT.dense.lineHeight;
      }
    },
  );
}

function secondParty(writer: DocumentWriter, input: ContractDocumentInput): void {
  const rows: [string, string][] = [
    ["اسم المنشأة / المحل:", input.merchantName],
    ["اسم المفوض / صاحب النشاط:", input.contactName || FILL],
    ["بطاقة الرقم القومي (١٤ رقمًا):", FILL],
    ["رقم السجل التجاري:", FILL],
    ["رقم التسجيل الضريبي:", FILL],
    ["رقم الهاتف / واتساب:", input.contactPhone || FILL],
    ["البريد الإلكتروني:", FILL],
    ["العنوان:", input.address || FILL],
  ];
  const estimate =
    PANEL_PAD + TEXT.heading.lineHeight + TEXT.dense.lineHeight + 16 + rows.length * TEXT.dense.lineHeight + PANEL_PAD;

  panel(
    writer,
    "gold",
    "الطرف الثاني: التاجر",
    `${input.businessType}: ${input.merchantName}`,
    estimate,
    (top) => {
      let cursor = top;
      for (const [label, value] of rows) {
        fieldRow(writer, cursor, label, value);
        cursor -= TEXT.dense.lineHeight;
      }
    },
  );
}

/** Draws the preamble date and both identification panels. */
export function drawParties(writer: DocumentWriter, input: ContractDocumentInput): void {
  datePreamble(writer);
  firstParty(writer);
  secondParty(writer, input);
}

/** Renders a labeled percentage like `١٢%` for reuse in summaries. */
export function rateLabel(rate: number): string {
  return `${toArabicNumerals(rate)}%`;
}
