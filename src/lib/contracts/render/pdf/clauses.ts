/**
 * Numbered clauses and the commission appendix for the contract document.
 *
 * Clauses are the heart of the document, so this module implements the
 * executive pagination the printed contract needs:
 *
 *   - a clause heading is never stranded at the bottom of a page;
 *   - body text never leaves a single orphan line on the next page;
 *   - multi-item obligations render as indented bullets with a hanging marker;
 *   - body text is justified for the dense, ruled look of a corporate contract;
 *   - the commission table isolates every percentage in LTR so `10%` never
 *     flips to `%10`.
 */

import { PALETTE, TEXT, wrapSpans, type DocumentWriter, type StyledSpan } from "@/lib/pdf";

import { buildClauses, clauseNumberLabel } from "../clauses";
import type { ContractDocumentInput } from "../input";
import { resolveLegalContext } from "../legal-context";
import {
  clauseHeadingHeight,
  drawClauseHeading,
  drawSectionHeading,
  headingHeight,
} from "./heading";
import { countFillRules, segmentLines } from "./html";

const FILL_RULE_HEIGHT = 22;
const MIN_BODY_LINES_AFTER_HEADING = 2;
const BULLET_INDENT = 16;

/** UI-safe LTR isolation for a percentage, so `10%` always reads forward. */
export function percentageLabel(rate: number): string {
  return `\u2066${rate}%\u2069`;
}

/** True when the remaining space can hold a heading plus two body lines. */
function headingFits(writer: DocumentWriter, title: string): boolean {
  const needed =
    clauseHeadingHeight(writer, title) +
    TEXT.body.lineHeight * MIN_BODY_LINES_AFTER_HEADING;
  return writer.y - needed >= writer.floor;
}

/** Strips a leading bullet marker from an author line. */
function asBullet(line: StyledSpan[]): { spans: StyledSpan[]; bullet: boolean } {
  const first = line[0];
  if (!first) return { spans: line, bullet: false };
  const match = /^\s*•\s*/.exec(first.text);
  if (!match) return { spans: line, bullet: false };
  const spans = line.slice();
  spans[0] = { ...first, text: first.text.slice(match[0].length) };
  return { spans, bullet: true };
}

/**
 * Draws one authored line as a flowing paragraph, breaking between visual lines.
 *
 * Bullet paragraphs get a hanging marker and a slightly narrower text box; the
 * last visual line of every paragraph is left ragged instead of justified.
 */
function drawParagraph(
  writer: DocumentWriter,
  spans: StyledSpan[],
  bullet: boolean,
): void {
  const size = TEXT.body.size;
  const lineHeight = TEXT.body.lineHeight;
  const indent = bullet ? BULLET_INDENT : 0;
  const width = writer.contentWidth - indent;
  const lines = wrapSpans(spans, width, size, writer.fonts, "rtl");
  if (lines.length === 0) return;

  writer.ensure(lineHeight);

  let index = 0;
  while (index < lines.length) {
    const available = writer.y - writer.floor;
    const fit = Math.max(1, Math.floor(available / lineHeight));

    let take = Math.min(fit, lines.length - index);
    if (take < lines.length - index && lines.length - index - take === 1 && take > 1) {
      take -= 1;
    }

    for (let i = 0; i < take; i += 1) {
      const isLastLineOfParagraph = index + i === lines.length - 1;
      const y = writer.y - size;
      if (bullet && index === 0 && i === 0) {
        writer.canvas.text([{ text: "•", bold: true }], {
          x: writer.right - 10,
          y,
          size,
          maxWidth: 10,
          align: "start",
          direction: "rtl",
          color: PALETTE.royal,
        });
      }
      writer.canvas.text(lines[index + i]!, {
        x: writer.left,
        y,
        size,
        maxWidth: width,
        align: "start",
        direction: "rtl",
        color: PALETTE.ink,
        justifyWidth: isLastLineOfParagraph ? undefined : width,
      });
      writer.y -= lineHeight;
    }
    index += take;

    if (index < lines.length) writer.addPage();
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

/** Removes the blank notes block when the operator did not supply notes. */
function visibleClauseBody(body: string, showNotes: boolean): string {
  if (showNotes) return body;
  const marker = body.indexOf("ملاحظات:");
  if (marker < 0) return body;
  return body.slice(0, marker).replace(/(?:<br\s*\/?>)+\s*$/i, "");
}

/** Draws the numbered legal clauses (with the commission clause injected). */
export function drawClauses(writer: DocumentWriter, input: ContractDocumentInput): void {
  const showNotes = Boolean(input.summaryNote?.trim());
  const { financialSpecialException, jurisdictionClause } = resolveLegalContext(input);
  const clauses =
    input.clauses && input.clauses.length > 0
      ? input.clauses
      : buildClauses({
          category: input.category,
          achievedPercent: input.displayRate,
          financialSpecialException,
          jurisdictionClause,
          showNotes,
        });

  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index]!;
    const body = visibleClauseBody(clause.body, showNotes);
    const title = `البند ${clauseNumberLabel(index)}: ${clause.title}`;

    if (!headingFits(writer, title)) writer.addPage();

    drawClauseHeading(writer, title);
    for (const line of segmentLines(body)) {
      const { spans, bullet } = asBullet(line);
      drawParagraph(writer, spans, bullet);
    }

    const rules = countFillRules(body);
    if (rules > 0) drawFillRules(writer, rules);

    const remaining = writer.y - writer.floor;
    writer.commit(0, remaining < 90 ? 6 : 10);
  }
}

/** Draws the commission appendix table. */
export function drawCommission(writer: DocumentWriter, input: ContractDocumentInput): void {
  const exceptions = input.exceptions ?? [];
  if (input.baseCommission === null && exceptions.length === 0) return;

  const rows: { label: string; rate: number }[] = [];
  if (input.baseCommission !== null) {
    rows.push({ label: "العمولة الأساسية (جميع المنتجات)", rate: input.baseCommission });
  }
  for (const ex of exceptions) rows.push({ label: ex.category, rate: ex.rate });

  const rowHeight = TEXT.cell.lineHeight + 10;
  const title = "ملحق العمولات: نسبة مقابل خدمات المنصة والتشغيل";
  const estimate = headingHeight({ title }) + rowHeight * (rows.length + 1) + 6;

  // Keep the commission schedule, copies note and signature cards together on
  // the final page instead of stranding the schedule above a page break.
  const SIGNATURE_BLOCK_RESERVE = 340;
  if (writer.y - (estimate + SIGNATURE_BLOCK_RESERVE) < writer.floor) {
    writer.addPage();
  }
  writer.ensure(estimate);

  drawSectionHeading(writer, { eyebrow: "ملحق", title });

  const { canvas } = writer;
  const rateColWidth = 150;
  const labelColWidth = writer.contentWidth - rateColWidth;
  const labelX = writer.left + rateColWidth;
  const rateX = writer.left;
  let top = writer.y;

  canvas.box(
    { x: writer.left, y: top - rowHeight, width: writer.contentWidth, height: rowHeight },
    { fill: PALETTE.royal },
  );
  canvas.text([{ text: "الفئة / النشاط", bold: true }], {
    x: labelX + 8,
    y: top - rowHeight + 8,
    size: TEXT.cellHead.size,
    maxWidth: labelColWidth - 16,
    align: "start",
    direction: "rtl",
    color: PALETTE.white,
  });
  canvas.text([{ text: "نسبة مقابل خدمات المنصة", bold: true }], {
    x: rateX,
    y: top - rowHeight + 8,
    size: TEXT.cellHead.size,
    maxWidth: rateColWidth,
    align: "center",
    direction: "rtl",
    color: PALETTE.white,
  });
  top -= rowHeight;

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
    canvas.text([{ text: percentageLabel(row.rate), bold: true }], {
      x: rateX,
      y: top - rowHeight + 8,
      size: TEXT.cell.size,
      maxWidth: rateColWidth,
      align: "center",
      direction: "ltr",
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
