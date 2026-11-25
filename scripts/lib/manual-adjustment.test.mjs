import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const rules = loadTsModule(
  path.join(projectRoot, "src/lib/operations/manual-adjustment.ts"),
);

const sum = (lines, side) =>
  lines.filter((line) => line.side === side).reduce((total, line) => total + line.amountMinor, 0);

test("courier bonus debits 5110 and credits the courier account", () => {
  const lines = rules.buildManualAdjustmentPlan("courier", "credit", 25_000);
  assert.deepEqual(lines, [
    { code: "5110", side: "debit", amountMinor: 25_000 },
    { code: "party", side: "credit", amountMinor: 25_000 },
  ]);
  assert.equal(rules.isAdjustmentBalanced(lines), true);
});

test("merchant bonus debits 5210 and credits the merchant account", () => {
  const lines = rules.buildManualAdjustmentPlan("merchant", "credit", 12_500);
  assert.equal(lines[0].code, "5210");
  assert.equal(sum(lines, "debit"), 12_500);
  assert.equal(sum(lines, "credit"), 12_500);
});

test("deductions debit the party and credit operational recoveries", () => {
  for (const partyType of ["courier", "merchant"]) {
    const lines = rules.buildManualAdjustmentPlan(partyType, "debit", 7_500);
    assert.deepEqual(lines, [
      { code: "party", side: "debit", amountMinor: 7_500 },
      { code: "4900", side: "credit", amountMinor: 7_500 },
    ]);
    assert.equal(rules.isAdjustmentBalanced(lines), true);
  }
});

test("a zero or negative adjustment is refused", () => {
  assert.throws(
    () => rules.buildManualAdjustmentPlan("courier", "credit", 0),
    /ADJUSTMENT_AMOUNT_INVALID/,
  );
  assert.throws(
    () => rules.buildManualAdjustmentPlan("merchant", "debit", -1),
    /ADJUSTMENT_AMOUNT_INVALID/,
  );
});
