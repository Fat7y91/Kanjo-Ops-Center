import { Text } from "@react-pdf/renderer";
import type { StyleProp } from "@react-pdf/types";

/**
 * Inline text handling for the clause bodies.
 *
 * The legal copy in `data/clauses.ts` is authored as light HTML (`<strong>`,
 * `<br>`, filler rule `<div>`s) because V1 injected it into the DOM. react-pdf
 * cannot render HTML, so we split it into styled text runs. `splitFillLines`
 * pulls the notes filler rules out so they can be drawn as native views.
 */

export type InlineSegment = { text: string; bold: boolean; br: boolean };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/** Splits a clause body into prose and the count of filler rule lines. */
export function splitFillLines(html: string): { prose: string; fillLines: number } {
  const fillLines = (html.match(/<div[^>]*border-bottom[^>]*>\s*<\/div>/gi) ?? []).length;
  const prose = html.replace(/<div[^>]*border-bottom[^>]*>\s*<\/div>/gi, "").trim();
  return { prose, fillLines };
}

/** Parses `<strong>`, `<br>` and stray tags into ordered inline segments. */
export function parseInline(html: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /<strong>([\s\S]*?)<\/strong>|<br\s*\/?>|<[^>]+>/gi;
  let last = 0;
  let match: RegExpExecArray | null;

  const pushText = (raw: string, bold: boolean) => {
    if (!raw) return;
    const text = decodeEntities(raw);
    if (text) segments.push({ text, bold, br: false });
  };

  while ((match = pattern.exec(html))) {
    pushText(html.slice(last, match.index), false);
    if (match[1] !== undefined) {
      pushText(match[1], true);
    } else if (/^<br/i.test(match[0])) {
      segments.push({ text: "", bold: false, br: true });
    }
    last = pattern.lastIndex;
  }
  pushText(html.slice(last), false);
  return segments;
}

type InlineProps = { html: string; style?: StyleProp };

/** Renders clause HTML as a single flowing paragraph with bold runs. */
export function Inline({ html, style }: InlineProps) {
  return (
    <Text style={style}>
      {parseInline(html).map((seg, index) =>
        seg.br ? (
          <Text key={index}>{"\n"}</Text>
        ) : (
          <Text key={index} style={seg.bold ? { fontWeight: 700 } : undefined}>
            {seg.text}
          </Text>
        ),
      )}
    </Text>
  );
}
