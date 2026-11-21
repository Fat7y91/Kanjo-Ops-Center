/**
 * Ambient type declarations for the pure-JS PDF engine dependencies.
 *
 * `pdf-lib` ships its own types. `fontkit` and `bidi-js` do not, so the small
 * surface this project uses is declared here instead of sprinkling `any` at the
 * call sites. Keep these in sync with the code in `src/lib/pdf`.
 */

declare module "fontkit" {
  export interface FontGlyph {
    id: number;
    codePoints: number[];
    advanceWidth: number;
  }

  export interface FontPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }

  export interface FontGlyphRun {
    glyphs: FontGlyph[];
    positions: FontPosition[];
    advanceWidth: number;
  }

  export interface Font {
    postscriptName: string | null;
    familyName: string | null;
    unitsPerEm: number;
    ascent: number;
    descent: number;
    capHeight: number;
    bbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
    layout(
      text: string,
      features?: string[] | Record<string, boolean>,
      script?: string,
      language?: string,
      direction?: "ltr" | "rtl",
    ): FontGlyphRun;
    hasGlyphForCodePoint(codePoint: number): boolean;
  }

  export function create(buffer: Uint8Array): Font;
}

declare module "bidi-js" {
  export interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }

  export interface Bidi {
    getEmbeddingLevels(text: string, direction?: "ltr" | "rtl" | null): EmbeddingLevels;
    getReorderSegments(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): number[][];
    getMirroredCharactersMap(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): Map<number, string>;
    getMirroredCharacter(char: string): string | null;
    getBidiCharTypeName(char: string): string;
  }

  export default function bidiFactory(): Bidi;
}
