/**
 * Parties section for the contract PDF.
 *
 * The date preamble plus two identification panels: the first party is Kanjo's
 * fixed registration data, the second is the merchant. Each panel is a soft card
 * with a coloured spine; the merchant panel lists the identity fields the printed
 * contract leaves for handwriting when data is missing.
 */

import { PALETTE, TEXT, type DocumentWriter, type StyledSpan } from "@/lib/pdf";
import { KANJO_FIRST_PARTY } from "../constants";
import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";

const FILL = "....................................";
const LABEL_WIDTH_RATIO = 0.42;

function panel(
  writer: DocumentWriter,
  spine: typeof PALETTE.royal,
  draw: (top: number, height: number) => void,
  estimate: number,
): void {
  const height = estimate;
  writer.ensure(height);
  const { canvas } = writer;
  const top = writer.y;
  const bottom = top - height;
  const x = writer.left;
  const width = writer.contentWidth;

  canvas.box({ x, y: bottom, width, height }, { fill: PALETTE.panel, border: PALETTE.line, borderWidth: 1, radius: 4 });
  canvas.box({ x: x + width - 4, y: bottom, width: 4, height }, { fill: spine, radius: 2 });

  draw(top, height);
  writer.commit(height, 12);
}

function datePreamble(writer: DocumentWriter): void {
  writer.ensure(34);
  const { canvas } = writer;
  const top = writer.y;
  const spans: StyledSpan[] = [
    {
      text: "إنه في يوم: ............................ الموافق: ...... / ...... / ............ م، تم الاتفاق والتراضي بين كل من:",
    },
  ];
  canvas.text(spans, {
    x: writer.left,
    y: top - TEXT.body.size,
    size: TEXT.body.size,
    maxWidth: writer.contentWidth,
    align: "start",
    direction: "rtl",
    color: PALETTE.inkSoft,
  });
  writer.commit(TEXT.body.size + 10, 10);
}

function fieldRow(
  writer: DocumentWriter,
  top: number,
  label: string,
  value: string,
): void {
  const { canvas } = writer;
  const size = TEXT.dense.size;
  const labelWidth = writer.contentWidth * LABEL_WIDTH_RATIO;
  canvas.text([{ text: label }], {
    x: writer.left + 12,
    y: top - size,
    size,
    maxWidth: labelWidth,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });
  canvas.text([{ text: value }], {
    x: writer.left + 12 + labelWidth,
    y: top - size,
    size,
    maxWidth: writer.contentWidth - labelWidth - 24,
    align: "start",
    direction: "rtl",
    color: PALETTE.ink,
  });
}

function firstParty(writer: DocumentWriter): void {
  const { canvas } = writer;
  const lines = 4;
  const estimate = 20 + lines * (TEXT.dense.lineHeight + 2);
  panel(
    writer,
    PALETTE.royal,
    (top) => {
      let cursor = top - 14;
      canvas.text(
        [
          { text: "الطرف الأول: ", bold: true },
          { text: KANJO_FIRST_PARTY.tradeName },
        ],
        {
          x: writer.left + 12,
          y: cursor - TEXT.dense.size,
          size: TEXT.dense.size,
          maxWidth: writer.contentWidth - 24,
          align: "start",
          direction: "rtl",
          color: PALETTE.ink,
        },
      );
      cursor -= TEXT.dense.lineHeight + 4;
      const reg = KANJO_FIRST_PARTY.commercialRegister;
      const card = KANJO_FIRST_PARTY.taxCard;
      const rows = [
        `السجل التجاري رقم (${reg}) — ${KANJO_FIRST_PARTY.commercialRegisterOffice}`,
        `البطاقة الضريبية رقم (${card}) — ${KANJO_FIRST_PARTY.taxOffice}`,
        `المقر: ${KANJO_FIRST_PARTY.address}`,
        "ويمثلها م/ محمود الجمل بصفته مدير التشغيل والتعاقدات.",
      ];
      for (const row of rows) {
        canvas.text([{ text: row }], {
          x: writer.left + 12,
          y: cursor - TEXT.dense.size,
          size: TEXT.dense.size,
          maxWidth: writer.contentWidth - 24,
          align: "start",
          direction: "rtl",
          color: PALETTE.inkSoft,
        });
        cursor -= TEXT.dense.lineHeight;
      }
      return cursor;
    },
    estimate,
  );
}

function secondParty(writer: DocumentWriter, input: ContractDocumentInput): void {
  const { canvas } = writer;
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
  const estimate = 22 + (rows.length + 1) * (TEXT.dense.lineHeight + 2);
  panel(
    writer,
    PALETTE.gold,
    (top) => {
      let cursor = top - 14;
      canvas.text(
        [
          { text: "الطرف الثاني: ", bold: true },
          { text: `${input.businessType}: ${input.merchantName}` },
        ],
        {
          x: writer.left + 12,
          y: cursor - TEXT.dense.size,
          size: TEXT.dense.size,
          maxWidth: writer.contentWidth - 24,
          align: "start",
          direction: "rtl",
          color: PALETTE.ink,
        },
      );
      cursor -= TEXT.dense.lineHeight + 4;
      for (const [label, value] of rows) {
        fieldRow(writer, cursor, label, value);
        cursor -= TEXT.dense.lineHeight;
      }
    },
    estimate,
  );
}

/** Draws the preamble and both identification panels. */
export function drawParties(writer: DocumentWriter, input: ContractDocumentInput): void {
  datePreamble(writer);
  firstParty(writer);
  secondParty(writer, input);
}

/** Renders a labeled percentage like `١٢%` for reuse in summaries. */
export function rateLabel(rate: number): string {
  return `${toArabicNumerals(rate)}%`;
}
