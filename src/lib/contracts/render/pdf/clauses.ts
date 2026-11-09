/**
 * Numbered clauses and the commission appendix for the contract document.
 *
 * Clauses are the heart of the document, so this module implements the "smart
 * pagination" the printed contract needs:
 *
 *   - a heading is never stranded at the bottom of a page: it reserves room for
 *     itself plus at least two body lines before it commits;
 *   - a body never leaves a single orphan line on the next page (a "widow"); if
 *     only one line would spill, a line is pulled back to keep at least two;
 *   - body text is justified to the content width so the right and left edges
 *     stay flush, giving the dense, ruled look of a corporate contract;
 *   - spacing between clauses is elastic: tighter when a page is filling up so
 *     we do not leave large gaps at the bottom.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter, type StyledSpan } from "@/lib/pdf";

import { buildClauses, clauseNumberLabel } from "../clauses";
import { toArabicNumerals } from "../format";
import type { ContractDocumentInput } from "../input";
import { resolveLegalContext } from "../legal-context";
import { drawSectionHeading, headingHeight } from "./heading";
import { countFillRules } from "./html";

const FILL_RULE_HEIGHT = 22;
const MIN_BODY_LINES_AFTER_HEADING = 2;

/** True when the remaining space can hold a heading plus two body lines. */
function headingFits(writer: DocumentWriter, title: string): boolean {
  const needed = headingHeight({ title }) + TEXT.body.lineHeight * MIN_BODY_LINES_AFTER_HEADING;
  return writer.y - needed >= writer.floor;
}

/**
 * Draws a justified paragraph that may spill across pages, breaking only between
 * lines. Every line except the last of a page-run is justified to the right edge.
 *
 * `avoidWidow` pulls one line back when a break would leave a single orphan line
 * on the following page.
 */
function flowingParagraph(writer: DocumentWriter, spans: StyledSpan[]): void {
  const size = TEXT.body.size;
  const lineHeight = TEXT.body.lineHeight;
  const lines = wrapSpans(spans, writer.contentWidth, size, writer.fonts, "rtl");
  if (lines.length === 0) return;

  // Reserve two lines so a heading is never left with a single body line.
  writer.ensure(Math.min(lineHeight * 2, writer.y - writer.floor));

  let index = 0;
  while (index < lines.length) {
    const available = writer.y - writer.floor;
    const fit = Math.max(1, Math.floor(available / lineHeight));

    // Widow control: if a break would strand exactly one line on the next page,
    // move one line down with it so the following page opens with two lines.
    let take = Math.min(fit, lines.length - index);
    if (take < lines.length - index && lines.length - index - take === 1 && take > 1) {
      take -= 1;
    }

    for (let i = 0; i < take; i += 1) {
      const isLastLineOfParagraph = index + i === lines.length - 1;
      const y = writer.y - size;
      writer.canvas.text(lines[index + i]!, {
        x: writer.left,
        y,
        size,
        maxWidth: writer.contentWidth,
        align: "start",
        direction: "rtl",
        color: PALETTE.ink,
        justifyWidth: isLastLineOfParagraph ? undefined : writer.contentWidth,
      });
      writer.y -= lineHeight;
    }
    index += take;

    if (index < lines.length) {
      writer.addPage();
    }
  }
}

function drawFillRules(writer: DocumentWriter, count: number): void {
  for (let i = 0; i < count; i += 1) {
    writer.ensure(FILL_RULE_HEIGHT);
    const y = writer.y - FILL_RULE_HEIGHT / 2;
    writer.canvas.page.drawLine({
      start: { x: writer.left + 4, y },
      end: { x: writer.right - 4, y },
      thickness: 0.8,
      color: PALETTE.lineStrong,
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
    const title = `البند ${clauseNumberLabel(index)}: ${clause.title}`;

    if (!headingFits(writer, title)) writer.addPage();

    drawSectionHeading(writer, { eyebrow: "بند تعاقدي", title });
    flowingParagraph(writer, [{ text: stripMarkup(clause.body) }]);
    const rules = countFillRules(clause.body);
    if (rules > 0) drawFillRules(writer, rules);

    // Elastic gap: tighter when the page is nearly full, roomier when there is
    // space, so bottoms never gape and clauses never crowd.
    const remaining = writer.y - writer.floor;
    const gap = remaining < 90 ? 6 : 12;
    writer.commit(0, gap);
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

  const rowHeight = TEXT.cell.lineHeight + 10;
  const headHeight = rowHeight;
  const title = "ملحق العمولات: نسبة مقابل خدمات المنصة والتشغيل";
  const estimate =
    headingHeight({ title }) + headHeight + rows.length * rowHeight + 6;
  writer.ensure(estimate);

  drawSectionHeading(writer, { eyebrow: "ملحق", title });

  const { canvas } = writer;
  const rateColWidth = 150;
  const labelColWidth = writer.contentWidth - rateColWidth;
  // RTL table: the category column sits on the right, the rate on the left.
  const labelX = writer.left + rateColWidth;
  const rateX = writer.left;
  let top = writer.y;

  canvas.box(
    { x: writer.left, y: top - headHeight, width: writer.contentWidth, height: headHeight },
    { fill: PALETTE.royal },
  );
  canvas.text([{ text: "الفئة / النشاط", bold: true }], {
    x: labelX + 8,
    y: top - headHeight + 9,
    size: TEXT.cellHead.size,
    maxWidth: labelColWidth - 16,
    align: "start",
    direction: "rtl",
    color: PALETTE.white,
  });
  canvas.text([{ text: "نسبة مقابل خدمات المنصة", bold: true }], {
    x: rateX,
    y: top - headHeight + 9,
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
      y: top - rowHeight + 9,
      size: TEXT.cell.size,
      maxWidth: labelColWidth - 16,
      align: "start",
      direction: "rtl",
      color: PALETTE.ink,
    });
    canvas.text([{ text: `${toArabicNumerals(row.rate)}%`, bold: true }], {
      x: rateX,
      y: top - rowHeight + 9,
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
