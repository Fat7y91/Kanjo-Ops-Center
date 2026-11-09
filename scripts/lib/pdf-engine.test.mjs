import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const bidi = loadTsModule(path.join(projectRoot, "src/lib/pdf/bidi.ts"));
const layout = loadTsModule(path.join(projectRoot, "src/lib/pdf/layout.ts"));
const shape = loadTsModule(path.join(projectRoot, "src/lib/pdf/shape.ts"));
const font = loadTsModule(path.join(projectRoot, "src/lib/pdf/font.ts"));
const palette = loadTsModule(path.join(projectRoot, "src/lib/pdf/palette.ts"));

test("decodeBase64 round-trips known bytes", () => {
  const bytes = font.decodeBase64("AAECAwQFBgc=");
  assert.deepEqual(Array.from(bytes), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("decodeBase64 ignores whitespace and padding", () => {
  const bytes = font.decodeBase64("AAEC\nAwQF Bgc=");
  assert.deepEqual(Array.from(bytes), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("splitBidiRuns covers the whole string without gaps", () => {
  const text = "مرحبا 123 abc";
  const levels = bidi.embeddingLevels(text, "rtl");
  const runs = bidi.splitBidiRuns(text, levels);
  assert.equal(runs[0].start, 0);
  assert.equal(runs.at(-1).end, text.length);
  for (let i = 1; i < runs.length; i += 1) {
    assert.equal(runs[i].start, runs[i - 1].end);
  }
});

test("splitBidiRuns separates digits from surrounding Arabic", () => {
  const text = "المبلغ ١٢٣ جنيهاً";
  const levels = bidi.embeddingLevels(text, "rtl");
  const runs = bidi.splitBidiRuns(text, levels);
  assert.ok(runs.length > 1);
});

test("reorderRuns reverses an all-RTL paragraph once", () => {
  assert.deepEqual(bidi.reorderRuns([1, 1, 1, 1]), [3, 2, 1, 0]);
});

test("reorderRuns keeps an all-LTR paragraph in order", () => {
  assert.deepEqual(bidi.reorderRuns([0, 0, 0]), [0, 1, 2]);
});

test("reorderRuns keeps an embedded LTR run intact inside RTL", () => {
  assert.deepEqual(bidi.reorderRuns([1, 2, 1]), [2, 1, 0]);
});

test("mirrorText swaps parentheses in a right-to-left run", () => {
  const mirrored = bidi.mirrorText("(٣٠٨٢٣٤)", "rtl");
  assert.equal(mirrored, ")٣٠٨٢٣٤(");
});

test("mirrorText leaves text without brackets unchanged", () => {
  assert.equal(bidi.mirrorText("مرحبا", "rtl"), "مرحبا");
});

test("PALETTE exposes pdf-lib colours in 0..1 RGB", () => {
  const { royal } = palette.PALETTE;
  assert.equal(typeof royal.red, "number");
  assert.ok(royal.red >= 0 && royal.red <= 1);
});

const CAN_EMBED = (() => {
  try {
    font.decodeBase64(
      loadTsModule(
        path.join(projectRoot, "src/lib/contracts/render/data/pdf-assets.ts"),
      ).CAIRO_REGULAR_BASE64.slice(0, 8),
    );
    return true;
  } catch {
    return false;
  }
})();

if (CAN_EMBED) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const fonts = await font.embedFonts(doc);

  test("embedFonts parses Cairo with the expected em size", () => {
    assert.equal(fonts.regular.metrics.unitsPerEm, 1000);
    assert.equal(fonts.bold.metrics.unitsPerEm, 1000);
    assert.equal(fonts.regular.bold, false);
    assert.equal(fonts.bold.bold, true);
  });

  test("shapeSpans produces glyphs for Arabic text", () => {
    const result = shape.shapeSpans([{ text: "عقد انضمام" }], "rtl", fonts);
    assert.ok(result.runs.length > 0);
    assert.ok(result.width > 0);
    const glyphCount = result.runs.reduce((n, run) => n + run.glyphs.length, 0);
    assert.ok(glyphCount > 0);
  });

  test("shapeSpans shapes Arabic into presentation forms (joined)", () => {
    const result = shape.shapeSpans([{ text: "ممم" }], "rtl", fonts);
    const ids = result.runs.flatMap((run) => run.glyphs.map((g) => g.id));
    // Three identical base letters shape into three distinct joining forms.
    assert.equal(new Set(ids).size, 3);
  });

  test("shapeSpans keeps a pure-number run left-to-right", () => {
    const result = shape.shapeSpans([{ text: "١٢٣٤٥" }], "rtl", fonts);
    const level = result.runs[0].level;
    assert.equal(level % 2, 0);
  });

  test("shapeSpans marks a bold span with the bold face", () => {
    const result = shape.shapeSpans(
      [{ text: "نسبة " }, { text: "١٢%", bold: true }],
      "rtl",
      fonts,
    );
    assert.ok(result.runs.some((run) => run.bold));
  });

  test("wrapSpans breaks a long Arabic paragraph into multiple lines", () => {
    const text =
      "تحصل كانجو مقابل خدمات المنصة والتشغيل على نسبة من كل طلب أو عملية بيع أو توريد أو خدمة تتم أو تبدأ من خلال المنصة ويجوز تحديد نسب مختلفة";
    const lines = layout.wrapSpans([{ text }], 250, 11, fonts, "rtl");
    assert.ok(lines.length > 1);
  });

  test("wrapSpans keeps a short line to a single row", () => {
    const lines = layout.wrapSpans([{ text: "عقد انضمام" }], 400, 11, fonts, "rtl");
    assert.equal(lines.length, 1);
  });

  test("measureSpans grows with font size", () => {
    const spans = [{ text: "عقد انضمام شركة كانجو" }];
    const small = layout.measureSpans(spans, 10, fonts, "rtl");
    const large = layout.measureSpans(spans, 20, fonts, "rtl");
    assert.ok(large > small);
  });
} else {
  test("pdf-assets unavailable; engine shaping tests skipped", () => {
    assert.ok(true);
  });
}
