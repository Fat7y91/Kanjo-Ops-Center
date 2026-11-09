/**
 * Numbered clauses and the commission appendix for the contract PDF.
 *
 * Each clause renders as a titled block: a purple heading strip with a gold
 * spine, then the wrapped body, then any dashed fill rules the source HTML asked
 * for. Blocks never split across pages mid-sentence: the heading and at least the
 * first lines are reserved together, and the body flows onto the next page only
 * at a line boundary.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter, type StyledSpan } from "@/lib/pdf";

import { buildClauses, clauseNumberLabel } from "../clauses";
import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";
import { resolveLegalContext } from "../legal-context";
import { countFillRules } from "./html";

const FILL_RULE_HEIGHT = 22;

function clauseHeading(
  writer: DocumentWriter,
  clauseIndex: number,
  title: string,
): void {
  sectionHeading(
    writer,
    `البند ${clauseNumberLabel(clauseIndex)}: ${title}`,
  );
}

/** A purple heading strip with a gold spine, used for clauses and appendices. */
function sectionHeading(writer: DocumentWriter, title: string): void {
  const { canvas } = writer;
  const height = TEXT.heading.lineHeight + 6;
  const top = writer.y;
  canvas.box(
    { x: writer.left, y: top - height, width: writer.contentWidth, height },
    { fill: PALETTE.purpleSoft, radius: 3 },
  );
  canvas.box(
    { x: writer.left + writer.contentWidth - 4, y: top - height, width: 4, height },
    { fill: PALETTE.gold },
  );
  canvas.text([{ text: title, bold: true }], {
    x: writer.left + 10,
    y: top - height + 6,
    size: TEXT.heading.size,
    maxWidth: writer.contentWidth - 20,
    align: "start",
    direction: "rtl",
    color: PALETTE.royal,
  });
  writer.commit(height, 6);
}

/**
 * Draws a paragraph that may spill across pages, breaking only between lines.
 *
 * Reserves at least one line before drawing so a body never starts with an
 * orphaned heading alone at the bottom of a page.
 */
function flowingParagraph(writer: DocumentWriter, spans: StyledSpan[]): void {
  const size = TEXT.body.size;
  const lineHeight = TEXT.body.lineHeight;
  const lines = wrapSpans(spans, writer.contentWidth, size, writer.fonts, "rtl");
  if (lines.length === 0) return;

  writer.ensure(Math.min(lineHeight * 2, writer.y - writer.floor));
  let cursor = writer.y;
  for (const line of lines) {
    if (cursor - lineHeight < writer.floor) {
      writer.y = cursor;
      writer.addPage();
      cursor = writer.y;
    }
    // Re-read the canvas each iteration: a mid-paragraph page break swaps the
    // active page, and the previous reference would draw at the wrong origin.
    writer.canvas.text(line, {
      x: writer.left,
      y: cursor - size,
      size,
      maxWidth: writer.contentWidth,
      align: "start",
      direction: "rtl",
      color: PALETTE.ink,
    });
    cursor -= lineHeight;
  }
  writer.y = cursor;
}

function drawFillRules(writer: DocumentWriter, count: number): void {
  for (let i = 0; i < count; i += 1) {
    writer.ensure(FILL_RULE_HEIGHT);
    const y = writer.y - FILL_RULE_HEIGHT / 2;
    writer.canvas.page.drawLine({
      start: { x: writer.left + 4, y },
      end: { x: writer.right - 4, y },
      thickness: 0.8,
      color: PALETTE.inkSoft,
      dashArray: [3, 3],
    });
    writer.commit(FILL_RULE_HEIGHT, 0);
  }
}

/** Draws the numbered legal clauses (with the commission clause injected). */
export function drawClauses(writer: DocumentWriter, input: ContractDocumentInput): void {
  const { financialSpecialException, jurisdictionClause } = resolveLegalContext(input);
  const clauses = buildClauses({
    category: input.category,
    achievedPercent: input.displayRate,
    financialSpecialException,
    jurisdictionClause,
  });

  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index]!;
    writer.ensure(60);
    clauseHeading(writer, index, clause.title);
    flowingParagraph(writer, [{ text: stripMarkup(clause.body) }]);
    const rules = countFillRules(clause.body);
    if (rules > 0) drawFillRules(writer, rules);
    writer.commit(0, 12);
  }
}

/** Removes inline tags but preserves the visible text (used for plain bodies). */
function stripMarkup(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Draws the commission appendix table when the contract carries overrides. */
export function drawCommission(writer: DocumentWriter, input: ContractDocumentInput): void {
  const exceptions = input.exceptions ?? [];
  if (input.baseCommission === null && exceptions.length === 0) return;

  const rows: { label: string; rate: number }[] = [];
  if (input.baseCommission !== null) {
    rows.push({ label: "العمولة الأساسية (جميع المنتجات)", rate: input.baseCommission });
  }
  for (const ex of exceptions) rows.push({ label: ex.category, rate: ex.rate });

  const rowHeight = TEXT.cell.lineHeight + 8;
  const headHeight = rowHeight;
  const estimate = TEXT.heading.lineHeight + 12 + headHeight + rows.length * rowHeight;
  writer.ensure(estimate);
  sectionHeading(writer, "ملحق العمولات: نسبة مقابل خدمات المنصة والتشغيل");

  const { canvas } = writer;
  const rateColWidth = 150;
  const labelColWidth = writer.contentWidth - rateColWidth;
  // Right-to-left table: the first column (category) sits on the right, the
  // numeric rate column on the left. Both cells are anchored to their own column
  // edges so a long label never runs under the rate.
  const labelX = writer.left + rateColWidth;
  const rateX = writer.left;
  let top = writer.y;

  // Header row.
  canvas.box(
    { x: writer.left, y: top - headHeight, width: writer.contentWidth, height: headHeight },
    { fill: PALETTE.royal },
  );
  canvas.text([{ text: "الفئة / النشاط", bold: true }], {
    x: labelX + 8,
    y: top - headHeight + 8,
    size: TEXT.cellHead.size,
    maxWidth: labelColWidth - 16,
    align: "start",
    direction: "rtl",
    color: PALETTE.white,
  });
  canvas.text([{ text: "نسبة مقابل خدمات المنصة", bold: true }], {
    x: rateX,
    y: top - headHeight + 8,
    size: TEXT.cellHead.size,
    maxWidth: rateColWidth,
    align: "center",
    direction: "rtl",
    color: PALETTE.white,
  });
  top -= headHeight;

  rows.forEach((row, index) => {
    if (index % 2 === 1) {
      canvas.box(
        { x: writer.left, y: top - rowHeight, width: writer.contentWidth, height: rowHeight },
        { fill: PALETTE.panel },
      );
    }
    canvas.rule(writer.left, writer.right, top - rowHeight, PALETTE.line, 0.8);
    canvas.text([{ text: row.label }], {
      x: labelX + 8,
      y: top - rowHeight + 8,
      size: TEXT.cell.size,
      maxWidth: labelColWidth - 16,
      align: "start",
      direction: "rtl",
      color: PALETTE.ink,
    });
    canvas.text([{ text: `${toArabicNumerals(row.rate)}%`, bold: true }], {
      x: rateX,
      y: top - rowHeight + 8,
      size: TEXT.cell.size,
      maxWidth: rateColWidth,
      align: "center",
      direction: "rtl",
      color: PALETTE.royal,
    });
    top -= rowHeight;
  });

  canvas.box(
    { x: writer.left, y: top, width: writer.contentWidth, height: writer.y - top },
    { border: PALETTE.lineStrong, borderWidth: 0.8, radius: 3 },
  );

  writer.y = top;
  writer.commit(0, 12);
}
