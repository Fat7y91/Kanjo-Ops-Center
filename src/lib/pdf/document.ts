/**
 * Multi-page document writer for the Kanjo PDF engine.
 *
 * Owns a `pdf-lib` document, embeds the Cairo faces once, and manages a cursor
 * that flows top-to-bottom across as many A4 pages as the content needs. Blocks
 * ask for space with `ensure`; when a block does not fit, a fresh page starts and
 * the block continues there. Page decorations (watermark, footer, page numbers)
 * are drawn in `finish`, once the total page count is known.
 */

import { PDFDocument, PDFName, rgb, type PDFImage, type PDFPage } from "pdf-lib";

import { PageCanvas } from "./canvas";
import { embedFonts, type FontSet } from "./font";
import { PALETTE } from "./palette";

export type PageGeometry = {
  /** Page size in points. Defaults to A4 portrait. */
  width: number;
  height: number;
  /** Margins in points. The content box is inset by these on every side. */
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  /**
   * Extra top space reserved on pages after the first, so a running header drawn
   * in the page hook never collides with the first line of continuing content.
   */
  continuationTopReserve?: number;
};

export const A4: PageGeometry = {
  width: 595.28,
  height: 841.89,
  marginTop: 44,
  marginRight: 40,
  marginBottom: 52,
  marginLeft: 40,
  continuationTopReserve: 26,
};

export type PageHook = (canvas: PageCanvas, pageNumber: number, totalPages: number) => void;

/** A single rendered page plus its canvas. */
export type RenderPage = { page: PDFPage; canvas: PageCanvas };

export class DocumentWriter {
  readonly doc: PDFDocument;
  readonly fonts: FontSet;
  readonly geometry: PageGeometry;
  readonly pages: RenderPage[] = [];
  private current: RenderPage | null = null;
  private cursorY = 0;

  private constructor(doc: PDFDocument, fonts: FontSet, geometry: PageGeometry) {
    this.doc = doc;
    this.fonts = fonts;
    this.geometry = geometry;
  }

  static async create(geometry: PageGeometry = A4): Promise<DocumentWriter> {
    const doc = await PDFDocument.create();
    const fonts = await embedFonts(doc);
    const writer = new DocumentWriter(doc, fonts, geometry);
    writer.addPage();
    return writer;
  }

  get canvas(): PageCanvas {
    if (!this.current) throw new Error("No active page");
    return this.current.canvas;
  }

  get page(): PDFPage {
    if (!this.current) throw new Error("No active page");
    return this.current.page;
  }

  /** Left edge of the content box. */
  get left(): number {
    return this.geometry.marginLeft;
  }

  /** Right edge of the content box. */
  get right(): number {
    return this.geometry.width - this.geometry.marginRight;
  }

  /** Width of the content box. */
  get contentWidth(): number {
    return this.right - this.left;
  }

  /** Lowest `y` content may occupy before a page break is due. */
  get floor(): number {
    return this.geometry.marginBottom;
  }

  /** Current vertical cursor (the next block's top edge). */
  get y(): number {
    return this.cursorY;
  }

  set y(value: number) {
    this.cursorY = value;
  }

  addPage(): void {
    const page = this.doc.addPage([this.geometry.width, this.geometry.height]);
    const canvas = new PageCanvas(page, this.fonts);
    this.current = { page, canvas };
    this.pages.push(this.current);
    const extra = this.pages.length > 1 ? (this.geometry.continuationTopReserve ?? 0) : 0;
    this.cursorY = this.geometry.height - this.geometry.marginTop - extra;
  }

  /**
   * Ensures `height` points remain above the floor, breaking to a new page if
   * not. Callers reserve space before drawing a block so it is never split at an
   * awkward point.
   */
  ensure(height: number): void {
    if (this.cursorY - height < this.floor && this.pages.length > 0) {
      this.addPage();
    }
  }

  /** Draws a block at the cursor, then advances it by `height` plus `gap`. */
  commit(height: number, gap = 0): void {
    this.cursorY -= height + gap;
  }

  /** True when the given point sits near the bottom of the page. */
  atBottom(threshold = 0): boolean {
    return this.cursorY <= this.floor + threshold;
  }

  /** Embeds a JPEG or PNG logo, choosing the decoder from the byte signature. */
  async embedImage(bytes: Uint8Array): Promise<PDFImage | null> {
    const isPng =
      bytes.length > 4 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isPng && !isJpeg) return null;
    try {
      return isPng ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    } catch {
      return null;
    }
  }

  /** Registers a reusable font-resource name for a page's text operators. */
  fontKey(face: "regular" | "bold"): PDFName {
    const font = face === "bold" ? this.fonts.bold.pdf : this.fonts.regular.pdf;
    return this.canvas.page.node.newFontDictionary(font.name, font.ref);
  }

  /**
   * Finalises the document: draws per-page decorations in order, then serialises
   * to bytes. `hook` receives the page number (1-based) and the total count.
   */
  async finish(hook?: PageHook): Promise<Uint8Array> {
    const total = this.pages.length;
    this.pages.forEach((renderPage, index) => {
      // Reset the active page so hooks can use the high-level canvas helpers.
      this.current = renderPage;
      hook?.(renderPage.canvas, index + 1, total);
    });
    return this.doc.save();
  }
}

export { PALETTE, rgb };
