import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const metrics = loadTsModule(
  path.join(projectRoot, "src/lib/operations/statement-metrics.ts"),
);

test("countStatementOrders counts distinct delivered orders only", () => {
  const count = metrics.countStatementOrders([
    { sourceType: "operation", sourceId: "op-1", orderNumber: "149571" },
    { sourceType: "operation", sourceId: "op-1", orderNumber: "149571" },
    { sourceType: "operation", sourceId: "op-2", orderNumber: "149572" },
    { sourceType: "courier_attendance", sourceId: "attendance:1:2026-11-01" },
    { sourceType: "merchant_settlement", sourceId: null },
    { sourceType: "manual_adjustment", sourceId: null },
  ]);
  assert.equal(count, 2);
});

test("countStatementOrders falls back to the source id and skips blanks", () => {
  assert.equal(
    metrics.countStatementOrders([
      { sourceType: "operation", sourceId: "op-9" },
      { sourceType: "operation", sourceId: " " },
      { sourceType: "manual", sourceId: "x" },
    ]),
    1,
  );
});

test("statementTotals sums debit and credit in major units", () => {
  assert.deepEqual(
    metrics.statementTotals([
      { debit: 100.25, credit: 0 },
      { debit: 0, credit: 40.5 },
    ]),
    { debit: 100.25, credit: 40.5 },
  );
});

test("withinStatementRange is inclusive and handles open bounds", () => {
  const range = { from: "2026-11-01", to: "2026-11-30" };
  assert.equal(metrics.withinStatementRange("2026-11-01", range), true);
  assert.equal(metrics.withinStatementRange("2026-11-30", range), true);
  assert.equal(metrics.withinStatementRange("2026-10-31", range), false);
  assert.equal(metrics.withinStatementRange("2026-12-01", range), false);
  assert.equal(metrics.withinStatementRange("2026-12-01", { from: null, to: null }), true);
});
