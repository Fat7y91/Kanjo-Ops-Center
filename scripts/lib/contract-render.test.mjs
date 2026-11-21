import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const fmt = loadTsModule(
  path.join(projectRoot, "src/lib/contracts/render/format.ts"),
);
const constants = loadTsModule(
  path.join(projectRoot, "src/lib/contracts/render/constants.ts"),
);
const clauses = loadTsModule(
  path.join(projectRoot, "src/lib/contracts/render/clauses.ts"),
);

test("toArabicNumerals maps every Western digit to Eastern Arabic", () => {
  assert.equal(fmt.toArabicNumerals("2026"), "٢٠٢٦");
  assert.equal(fmt.toArabicNumerals(1094), "١٠٩٤");
  assert.equal(fmt.toArabicNumerals(null), "");
  assert.equal(fmt.toArabicNumerals(undefined), "");
});

test("ltrNumber isolates the run with isolate-override", () => {
  const html = fmt.ltrNumber("٧٨٣-٤١٠-٨٥٩");
  assert.match(html, /unicode-bidi: isolate-override/);
  assert.match(html, /dir="ltr"/);
});

test("escapeHtml neutralises markup metacharacters", () => {
  assert.equal(
    fmt.escapeHtml('<b>"x" & \'y\'</b>'),
    "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;",
  );
});

test("getBaseName strips bidi marks and follow-up suffixes", () => {
  assert.equal(fmt.getBaseName("متجر\u200f(متابعة)"), "متجر");
  assert.equal(fmt.getBaseName("متجر (متابعه)"), "متجر");
  assert.equal(fmt.getBaseName(""), "");
});

test("sanitizeLegalText maps colloquial wording to formal terms", () => {
  assert.equal(fmt.sanitizeLegalText("صاحب المحل"), "المالك");
  assert.equal(fmt.sanitizeLegalText("كاش"), "نقداً");
});

test("resolveBusinessType prefers explicit non-placeholder type", () => {
  assert.equal(constants.resolveBusinessType("صيدليات", "صيدلية"), "صيدلية");
  assert.equal(constants.resolveBusinessType("صيدليات", "متابعة"), "صيدلية");
  assert.equal(constants.resolveBusinessType("جزارة", null), "محل جزارة");
  assert.equal(constants.resolveBusinessType("", null), "منشأة");
});

test("isRestaurantCafeCategoryExact only matches full cafe categories", () => {
  assert.equal(constants.isRestaurantCafeCategoryExact("مطاعم وكافيهات"), true);
  assert.equal(constants.isRestaurantCafeCategoryExact("مطاعم"), false);
});

test("buildClauses keeps canonical order and injects the commission clause", () => {
  const list = clauses.buildClauses({
    category: "صيدليات",
    achievedPercent: 12,
    financialSpecialException: "",
    jurisdictionClause: "ثم تختص محكمة دسوق.",
  });
  const titles = list.map((c) => c.title);
  assert.equal(titles[0], "موضوع العقد وطبيعة العلاقة");
  assert.ok(titles.includes("رسوم تقديم الخدمات والتشغيل"));
  assert.ok(titles.includes("العقاقير الطبية والمنتجات المقيدة"));
  assert.equal(titles.at(-1), "القانون والإخطارات والأحكام الختامية");

  const commission = list.find((c) => c.title === "رسوم تقديم الخدمات والتشغيل");
  assert.match(commission.body, /\[ ١٢% \]/);
});

test("buildClauses adds the food clause only for food categories", () => {
  const food = clauses.buildClauses({
    category: "مطاعم",
    achievedPercent: 10,
    financialSpecialException: "",
    jurisdictionClause: "",
  });
  const retail = clauses.buildClauses({
    category: "هدايا",
    achievedPercent: 10,
    financialSpecialException: "",
    jurisdictionClause: "",
  });
  assert.ok(food.some((c) => c.title === "المطاعم والكافيهات والأغذية"));
  assert.ok(!retail.some((c) => c.title === "المطاعم والكافيهات والأغذية"));
});

test("buildClauses appends the financial exception when provided", () => {
  const list = clauses.buildClauses({
    category: "هدايا",
    achievedPercent: 10,
    financialSpecialException: " استثناء خاص.",
    jurisdictionClause: "",
  });
  const financial = list.find(
    (c) => c.title === "آلية المعاملات النقدية والتسويات المالية",
  );
  assert.match(financial.body, /استثناء خاص/);
});

test("clauseNumberLabel falls back to the 1-based index past the table", () => {
  assert.equal(clauses.clauseNumberLabel(0), "الأول");
  assert.equal(clauses.clauseNumberLabel(19), "العشرون");
  assert.equal(clauses.clauseNumberLabel(25), "26");
});
