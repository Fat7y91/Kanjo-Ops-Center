/**
 * Page writer for the Kanjo document engine.
 *
 * Owns one `pdf-lib` page and the small primitives the contract layout is built
 * from: filled and outlined boxes, rules, text blocks with wrapping and
 * alignment, and dividers. Everything is drawn in PDF points with the origin at
 * the bottom-left corner, so all vertical flow uses a cursor measured from the
 * bottom of the page.
 */

import { PDFName, rgb, type PDFPage } from "pdf-lib";

import { drawLine } from "./draw";
import type { EmbeddedFace, FontSet } from "./font";
import { wrapSpans } from "./layout";
import { PALETTE, type Rgb } from "./palette";
import type { Direction, StyledSpan, TextAlign } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

export type DrawBoxOptions = {
  /** Fill colour; omitted means no fill. */
  fill?: Rgb;
  /** Border colour; omitted means no border. */
  border?: Rgb;
  borderWidth?: number;
  /** Dash pattern in points, e.g. `[3, 3]`, for a dashed border. */
  dash?: number[];
  radius?: number;
  opacity?: number;
};

/** A reusable helper that binds a page to the embedded fonts it draws with. */
export class PageCanvas {
  readonly page: PDFPage;
  readonly faces: FontSet;
  readonly regularKey: PDFName;
  readonly boldKey: PDFName;

  constructor(page: PDFPage, faces: FontSet) {
    this.page = page;
    this.faces = faces;
    // Register both weights as page resources once. `pdf-lib` assigns a unique
    // resource name per weight; drawing then refers to that name directly.
    this.regularKey = page.node.newFontDictionary(faces.regular.pdf.name, faces.regular.pdf.ref);
    this.boldKey = page.node.newFontDictionary(faces.bold.pdf.name, faces.bold.pdf.ref);
  }

  get width(): number {
    return this.page.getWidth();
  }

  get height(): number {
    return this.page.getHeight();
  }

  /** Filled and/or outlined rectangle using absolute PDF coordinates. */
  box(rect: Rect, options: DrawBoxOptions = {}): void {
    const needsBorder = options.border !== undefined && (options.borderWidth ?? 1) > 0;
    this.page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: options.fill,
      borderColor: needsBorder ? options.border : undefined,
      borderWidth: needsBorder ? (options.borderWidth ?? 1) : undefined,
      borderDashArray: needsBorder ? options.dash : undefined,
      opacity: options.opacity,
    });
  }

  /** Horizontal rule between two x positions at `y`. */
  rule(x1: number, x2: number, y: number, color: Rgb = PALETTE.line, thickness = 1): void {
    this.page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness,
      color,
    });
  }

  /** Dashed horizontal rule, used for fill-in lines and soft dividers. */
  dashedRule(
    x1: number,
    x2: number,
    y: number,
    color: Rgb = PALETTE.lineStrong,
    thickness = 0.8,
    dash: number[] = [2.5, 2.5],
  ): void {
    this.page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness,
      color,
      dashArray: dash,
    });
  }

  /** Vertical rule between two y positions at `x`. */
  vrule(x: number, y1: number, y2: number, color: Rgb = PALETTE.line, thickness = 1): void {
    this.page.drawLine({
      start: { x, y: y1 },
      end: { x, y: y2 },
      thickness,
      color,
    });
  }

  private fontKey(face: EmbeddedFace): PDFName {
    return face.bold ? this.boldKey : this.regularKey;
  }

  /**
   * Draws one line of styled spans and returns its width in points.
   *
   * `align` is expressed in logical terms ("start" is the reading-direction
   * start), so right-to-left paragraphs align to the right edge by default.
   */
  text(
    spans: StyledSpan[],
    options: {
      x: number;
      y: number;
      size: number;
      maxWidth: number;
      align?: TextAlign;
      direction?: Direction;
      color?: Rgb;
      justifyWidth?: number;
    },
  ): number {
    return drawLine({
      page: this.page,
      faces: this.faces,
      fontKeys: { regular: this.regularKey, bold: this.boldKey },
      spans,
      x: options.x,
      y: options.y,
      size: options.size,
      maxWidth: options.maxWidth,
      align: options.align,
      direction: options.direction ?? "rtl",
      color: options.color,
      justifyWidth: options.justifyWidth,
    });
  }

  /**
   * Lays out a wrapped paragraph and draws its lines top-down from `top`.
   *
   * Returns the `y` cursor just below the last line so callers can continue the
   * flow. `lineHeight` defaults to a comfortable `1.7×` of the font size.
   */
  paragraph(
    spans: StyledSpan[],
    options: {
      x: number;
      top: number;
      maxWidth: number;
      size: number;
      lineHeight?: number;
      align?: TextAlign;
      direction?: Direction;
      color?: Rgb;
    },
  ): { bottom: number; lines: number } {
    const lineHeight = options.lineHeight ?? options.size * 1.7;
    const direction = options.direction ?? "rtl";
    const lines = wrapSpans(spans, options.maxWidth, options.size, this.faces, direction);
    let baseline = options.top - options.size;
    for (const line of lines) {
      this.text(line, {
        x: options.x,
        y: baseline,
        size: options.size,
        maxWidth: options.maxWidth,
        align: options.align,
        direction,
        color: options.color,
      });
      baseline -= lineHeight;
    }
    return { bottom: baseline + lineHeight - options.size, lines: lines.length };
  }
}
