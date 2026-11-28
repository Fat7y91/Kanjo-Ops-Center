import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const names = loadTsModule(
  path.join(projectRoot, "src/lib/exports/file-names.ts"),
);
const reportExcel = loadTsModule(
  path.join(projectRoot, "src/lib/operations/clearing-report-excel.ts"),
);

/** Noon UTC keeps the Cairo calendar day unambiguous. */
const AT = new Date("2026-11-25T12:00:00Z");

test("cairoFileDate formats DD-MM-YYYY on the Cairo calendar", () => {
  assert.equal(names.cairoFileDate(AT), "25-11-2026");
});

test("merchant and courier statements use the exact Arabic file names", () => {
  assert.equal(
    names.statementFileBase("merchant", "كبده الفلاح", AT),
    "كشف حساب تاجر كبده الفلاح 25-11-2026",
  );
  assert.equal(
    names.statementFileBase("courier", "يوسف علي", AT),
    "كشف حساب مندوب توصيل يوسف علي 25-11-2026",
  );
});

test("master collections and payables use the exact Arabic file names", () => {
  assert.equal(
    names.clearingReportFileBase("collections", AT),
    "كشف إجمالي التحصيلات المعتمدة 25-11-2026",
  );
  assert.equal(
    names.clearingReportFileBase("payables", AT),
    "كشف إجمالي السدادات والمستحقات 25-11-2026",
  );
});

test("contract files are named after the partnership and the merchant", () => {
  assert.equal(
    names.contractFileBase("حلواني الصردي", AT),
    "عقد شراكة حلواني الصردي 25-11-2026",
  );
});

test("excelFileName appends the .xlsx extension", () => {
  assert.equal(
    names.excelFileName("كشف إجمالي التحصيلات المعتمدة 25-11-2026"),
    "كشف إجمالي التحصيلات المعتمدة 25-11-2026.xlsx",
  );
});

test("reportFileName mirrors the master report title and date", () => {
  assert.equal(
    reportExcel.reportFileName({ kind: "collections" }, AT),
    "كشف إجمالي التحصيلات المعتمدة 25-11-2026.xlsx",
  );
  assert.equal(
    reportExcel.reportFileName({ kind: "payables" }, AT),
    "كشف إجمالي السدادات والمستحقات 25-11-2026.xlsx",
  );
});

test("illegal filename characters are stripped without losing Arabic", () => {
  const name = names.contractFileBase("م/محمود الجمل", AT);
  assert.ok(!name.includes("/"));
  assert.ok(name.includes("محمود الجمل"));
  assert.ok(name.endsWith("25-11-2026"));
});
