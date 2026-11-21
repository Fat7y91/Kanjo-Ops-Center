/**
 * Public entry point for the Kanjo PDF engine.
 *
 * The engine is a small, dependency-light toolkit for building printed Arabic
 * paperwork on the edge runtime: it owns bidi reordering, Arabic shaping with
 * fontkit, glyph-accurate drawing with pdf-lib, page flow, and the small set of
 * primitives (boxes, rules, tables) the contract layout needs.
 *
 * Import from here rather than the individual modules, so the internal file
 * layout can change without touching call sites.
 */

export * from "./types";
export { PALETTE, type Palette } from "./palette";
export { TEXT, type TextStyle } from "./style";
export { embedFonts, decodeBase64, faceFor, pointScale, type EmbeddedFace, type FontSet } from "./font";
export { shapeSpans, measureWidth, type ShapeResult, type Faces } from "./shape";
export { wrapSpans, measureSpans, countLines } from "./layout";
export { drawLine, type DrawTextOptions } from "./draw";
export { PageCanvas, type Rect, type DrawBoxOptions } from "./canvas";
export {
  DocumentWriter,
  A4,
  type PageGeometry,
  type PageHook,
  type PageHookInfo,
  type PageKind,
  type RenderPage,
} from "./document";
