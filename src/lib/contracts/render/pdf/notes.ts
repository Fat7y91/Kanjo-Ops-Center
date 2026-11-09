/**
 * Narrative blocks for the contract PDF: the preamble and the copies note.
 *
 * These are fixed legal copy with no data binding, drawn as centred callout
 * cards so they stand apart from the numbered clauses without competing with
 * them.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter } from "@/lib/pdf";

const PREAMBLE =
  "حيث إن كانجو منصة إلكترونية تجارية وتشغيلية لعرض وطلب وتوصيل المنتجات، وحيث إن الطرف الثاني يرغب في الانضمام إليها؛ فقد اتفق الطرفان على تنظيم العلاقة بما يحفظ حقوق كانجو، ويضمن جودة المنتجات. ويعد هذا التمهيد وملاحق العقد جزءًا لا يتجزأ منه.";

const COPIES_NOTE =
  "تحرر هذا العقد من نسختين أصليتين متطابقتين، بِيَد كل طرف نسخة للعمل بموجبها، ويتكون العقد من البنود والملاحق المذكورة أعلاه.";

/** Reserved height for a padded callout containing `lineCount` body lines. */
function calloutHeight(lineCount: number): number {
  const title = TEXT.heading.lineHeight + 6;
  return title + lineCount * TEXT.body.lineHeight + 18;
}

/** Draws the "التمهيد" preamble as a titled callout card. */
export function drawPreamble(writer: DocumentWriter): void {
  const { canvas } = writer;
  const lines = wrapSpans([{ text: PREAMBLE }], writer.contentWidth - 24, TEXT.body.size, writer.fonts, "rtl");
  const height = calloutHeight(lines.length);
  writer.ensure(height);
  const top = writer.y;
  const bottom = top - height;

  canvas.box(
    { x: writer.left, y: bottom, width: writer.contentWidth, height },
    { fill: PALETTE.panel, border: PALETTE.line, borderWidth: 1, radius: 4 },
  );
  canvas.box(
    { x: writer.left + writer.contentWidth - 4, y: bottom, width: 4, height },
    { fill: PALETTE.gold },
  );
  canvas.text([{ text: "التمهيد", bold: true }], {
    x: writer.left + 12,
    y: top - TEXT.heading.size - 8,
    size: TEXT.heading.size,
    maxWidth: writer.contentWidth - 24,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });

  let baseline = top - TEXT.heading.lineHeight - 6 - TEXT.body.size;
  for (const line of lines) {
    canvas.text(line, {
      x: writer.left + 12,
      y: baseline,
      size: TEXT.body.size,
      maxWidth: writer.contentWidth - 24,
      align: "start",
      direction: "rtl",
      color: PALETTE.ink,
    });
    baseline -= TEXT.body.lineHeight;
  }
  writer.commit(height, 12);
}

/** Draws the "نسختان" copies note as a centred band. */
export function drawCopiesNote(writer: DocumentWriter): void {
  const { canvas } = writer;
  const lines = wrapSpans([{ text: COPIES_NOTE }], writer.contentWidth - 24, TEXT.dense.size, writer.fonts, "rtl");
  const height = lines.length * TEXT.dense.lineHeight + 18;
  writer.ensure(height);
  const top = writer.y;
  const bottom = top - height;

  canvas.box(
    { x: writer.left, y: bottom, width: writer.contentWidth, height },
    { fill: PALETTE.goldSoft, border: PALETTE.goldBright, borderWidth: 0.8, radius: 4 },
  );

  let baseline = top - 9 - TEXT.dense.size;
  for (const line of lines) {
    canvas.text(line, {
      x: writer.left + 12,
      y: baseline,
      size: TEXT.dense.size,
      maxWidth: writer.contentWidth - 24,
      align: "center",
      direction: "rtl",
      color: PALETTE.ink,
    });
    baseline -= TEXT.dense.lineHeight;
  }
  writer.commit(height, 12);
}
