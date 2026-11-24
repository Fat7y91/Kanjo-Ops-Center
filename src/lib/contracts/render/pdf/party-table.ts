/**
 * Bordered two-column key-value table for a contract party.
 *
 * Labels occupy the right (reading-start) column and values the left, with a
 * crisp divider, zebra fills and a coloured header band. Long values wrap inside
 * their cell instead of colliding with the neighbouring column, and an empty
 * value renders as an em dash so the printed contract never shows a blank cell.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter } from "@/lib/pdf";

export type PartyTableRow = { label: string; value: string };

export type PartyTableTone = "royal" | "gold";

const LABEL_RATIO = 0.38;
const PAD_X = 8;
const PAD_Y = 5;
const EMPTY = "—";

function toneColors(tone: PartyTableTone) {
  return tone === "royal"
    ? { band: PALETTE.royal, subtitle: PALETTE.goldSoft }
    : { band: PALETTE.goldDeep, subtitle: PALETTE.goldSoft };
}

function cellLines(
  writer: DocumentWriter,
  text: string,
  width: number,
  size: number,
): string[][] {
  return wrapSpans([{ text }], width, size, writer.fonts, "rtl").map((line) =>
    line.map((span) => span.text),
  );
}

function rowHeight(
  writer: DocumentWriter,
  row: PartyTableRow,
  labelWidth: number,
  valueWidth: number,
): number {
  const size = TEXT.dense.size;
  const label = cellLines(writer, row.label, labelWidth - PAD_X * 2, size);
  const value = cellLines(writer, row.value || EMPTY, valueWidth - PAD_X * 2, size);
  return Math.max(label.length, value.length, 1) * TEXT.dense.lineHeight + PAD_Y * 2;
}

/** Total height of a party table, for `ensure`. */
export function partyTableHeight(
  writer: DocumentWriter,
  title: string,
  subtitle: string | null,
  rows: PartyTableRow[],
): number {
  const headerH =
    TEXT.heading.lineHeight + (subtitle ? TEXT.small.lineHeight : 0) + PAD_Y * 2 + 4;
  const width = writer.contentWidth;
  const labelWidth = width * LABEL_RATIO;
  const valueWidth = width - labelWidth;
  const body = rows.reduce(
    (sum, row) => sum + rowHeight(writer, row, labelWidth, valueWidth),
    0,
  );
  return headerH + body + 2;
}

/** Draws the table and advances the writer cursor. */
export function drawPartyTable(
  writer: DocumentWriter,
  tone: PartyTableTone,
  title: string,
  subtitle: string | null,
  rows: PartyTableRow[],
): void {
  const height = partyTableHeight(writer, title, subtitle, rows);
  writer.ensure(height);
  const { canvas } = writer;
  const left = writer.left;
  const width = writer.contentWidth;
  const top = writer.y;
  const bottom = top - height;
  const labelWidth = width * LABEL_RATIO;
  const valueWidth = width - labelWidth;
  const labelX = left + valueWidth;
  const colors = toneColors(tone);

  canvas.box(
    { x: left, y: bottom, width, height },
    { fill: PALETTE.white, border: PALETTE.lineStrong, borderWidth: 1, radius: 4 },
  );

  const headerH =
    TEXT.heading.lineHeight + (subtitle ? TEXT.small.lineHeight : 0) + PAD_Y * 2 + 4;
  canvas.box(
    { x: left, y: top - headerH, width, height: headerH },
    { fill: colors.band, radius: 4 },
  );

  let cursor = top - PAD_Y - 2;
  canvas.text([{ text: title, bold: true }], {
    x: left + PAD_X,
    y: cursor - TEXT.heading.size,
    size: TEXT.heading.size,
    maxWidth: width - PAD_X * 2,
    align: "start",
    direction: "rtl",
    color: PALETTE.white,
  });
  cursor -= TEXT.heading.lineHeight;
  if (subtitle) {
    canvas.text([{ text: subtitle }], {
      x: left + PAD_X,
      y: cursor - TEXT.small.size,
      size: TEXT.small.size,
      maxWidth: width - PAD_X * 2,
      align: "start",
      direction: "rtl",
      color: colors.subtitle,
    });
  }

  let rowTop = top - headerH;
  rows.forEach((row, index) => {
    const h = rowHeight(writer, row, labelWidth, valueWidth);
    const rowBottom = rowTop - h;

    if (index % 2 === 1) {
      canvas.box(
        { x: left, y: rowBottom, width, height: h },
        { fill: PALETTE.panelAlt },
      );
    }
    canvas.rule(left, left + width, rowBottom, PALETTE.line, 0.7);
    canvas.vrule(labelX, rowBottom, rowTop, PALETTE.line, 0.7);

    const labelLines = cellLines(writer, row.label, labelWidth - PAD_X * 2, TEXT.dense.size);
    let labelY = rowTop - PAD_Y;
    for (const line of labelLines) {
      canvas.text([{ text: line.join("") }], {
        x: labelX + PAD_X,
        y: labelY - TEXT.dense.size,
        size: TEXT.dense.size,
        maxWidth: labelWidth - PAD_X * 2,
        align: "start",
        direction: "rtl",
        color: PALETTE.royal,
      });
      labelY -= TEXT.dense.lineHeight;
    }

    const valueLines = cellLines(
      writer,
      row.value || EMPTY,
      valueWidth - PAD_X * 2,
      TEXT.dense.size,
    );
    let valueY = rowTop - PAD_Y;
    for (const line of valueLines) {
      canvas.text([{ text: line.join("") }], {
        x: left + PAD_X,
        y: valueY - TEXT.dense.size,
        size: TEXT.dense.size,
        maxWidth: valueWidth - PAD_X * 2,
        align: "start",
        direction: "rtl",
        color: PALETTE.ink,
      });
      valueY -= TEXT.dense.lineHeight;
    }

    rowTop = rowBottom;
  });

  writer.y = bottom;
  writer.commit(0, 12);
}
