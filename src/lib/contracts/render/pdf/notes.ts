/**
 * Narrative blocks for the contract document: the preamble and the copies note.
 *
 * Both are fixed legal copy with no data binding. The preamble uses the shared
 * section heading so it reads as part of the same system as the clauses; the
 * copies note is a gold-toned band that closes the legal body before the summary.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter } from "@/lib/pdf";

import { drawSectionHeading, headingHeight } from "./heading";

const PREAMBLE =
  "حيث إن كانچو منصة إلكترونية تجارية وتشغيلية لعرض وطلب وتوصيل المنتجات، وحيث إن الطرف الثاني يرغب في الانضمام إليها؛ فقد اتفق الطرفان على تنظيم العلاقة بما يحفظ حقوق كانچو، ويضمن جودة المنتجات. ويعد هذا التمهيد وملاحق العقد جزءًا لا يتجزأ منه.";

const COPIES_NOTE =
  "تحرر هذا العقد من نسختين أصليتين متطابقتين، بِيَد كل طرف نسخة للعمل بموجبها، ويتكون العقد من البنود والملاحق المذكورة أعلاه.";

const BODY_PAD = 12;

/** Draws the "التمهيد" preamble as a justified panel under a shared heading. */
export function drawPreamble(writer: DocumentWriter): void {
  const title = "التمهيد";
  const lines = wrapSpans(
    [{ text: PREAMBLE }],
    writer.contentWidth - BODY_PAD * 2,
    TEXT.body.size,
    writer.fonts,
    "rtl",
  );
  const panelH = lines.length * TEXT.body.lineHeight + BODY_PAD * 2;
  writer.ensure(headingHeight({ title }) + panelH);

  drawSectionHeading(writer, { eyebrow: "تمهيد", title });

  const { canvas } = writer;
  const top = writer.y;
  const bottom = top - panelH;
  canvas.box(
    { x: writer.left, y: bottom, width: writer.contentWidth, height: panelH },
    { fill: PALETTE.panel, border: PALETTE.line, borderWidth: 1, radius: 5 },
  );

  let cursor = top - BODY_PAD;
  lines.forEach((line, index) => {
    const last = index === lines.length - 1;
    canvas.text(line, {
      x: writer.left + BODY_PAD,
      y: cursor - TEXT.body.size,
      size: TEXT.body.size,
      maxWidth: writer.contentWidth - BODY_PAD * 2,
      align: "start",
      direction: "rtl",
      color: PALETTE.ink,
      justifyWidth: last ? undefined : writer.contentWidth - BODY_PAD * 2,
    });
    cursor -= TEXT.body.lineHeight;
  });
  writer.commit(panelH, 14);
}

/** Draws the "نسختان" copies note as a centred gold band. */
export function drawCopiesNote(writer: DocumentWriter): void {
  const { canvas } = writer;
  const lines = wrapSpans(
    [{ text: COPIES_NOTE }],
    writer.contentWidth - BODY_PAD * 2,
    TEXT.dense.size,
    writer.fonts,
    "rtl",
  );
  const height = lines.length * TEXT.dense.lineHeight + 20;
  writer.ensure(height);
  const top = writer.y;
  const bottom = top - height;

  canvas.box(
    { x: writer.left, y: bottom, width: writer.contentWidth, height },
    { fill: PALETTE.goldSoft, border: PALETTE.goldBright, borderWidth: 0.8, radius: 5 },
  );
  canvas.box(
    { x: writer.left, y: bottom, width: 4, height },
    { fill: PALETTE.gold, radius: 2 },
  );

  let baseline = top - 10 - TEXT.dense.size;
  for (const line of lines) {
    canvas.text(line, {
      x: writer.left + BODY_PAD,
      y: baseline,
      size: TEXT.dense.size,
      maxWidth: writer.contentWidth - BODY_PAD * 2,
      align: "center",
      direction: "rtl",
      color: PALETTE.ink,
    });
    baseline -= TEXT.dense.lineHeight;
  }
  writer.commit(height, 14);
}
