import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const format = loadTsModule(
  path.join(projectRoot, "src/lib/field-ops/merchant-balance-format.ts"),
);

test("a positive net means the merchant owes Kanjo", () => {
  assert.equal(format.merchantBalanceTone(120), "due_to_house");
});

test("a negative net means Kanjo owes the merchant", () => {
  assert.equal(format.merchantBalanceTone(-45), "due_to_merchant");
});

test("a zero net is settled", () => {
  assert.equal(format.merchantBalanceTone(0), "settled");
});

test("an agreed rate renders with the Arabic percent sign", () => {
  assert.equal(format.commissionRateLabel(12, (v) => String(v)), "12٪");
});

test("a fractional rate keeps its decimals from the formatter", () => {
  assert.equal(format.commissionRateLabel(7.5, (v) => v.toFixed(1)), "7.5٪");
});

test("an unsigned contract shows a dash, never a misleading 0%", () => {
  assert.equal(format.commissionRateLabel(null, (v) => String(v)), "—");
  assert.equal(format.commissionRateLabel(undefined, (v) => String(v)), "—");
});

test("a non-finite rate degrades to a dash", () => {
  assert.equal(format.commissionRateLabel(Number.NaN, (v) => String(v)), "—");
});

test("a signed agreement rate wins over the target", () => {
  assert.equal(format.effectiveCommissionRate(10, 15), 10);
});

test("an unsigned contract falls back to its target rate", () => {
  // The posting trigger charges coalesce(agreed, target), so the directory must
  // show the target rather than a dash when only the target exists.
  assert.equal(format.effectiveCommissionRate(null, 15), 15);
});

test("no rate at all resolves to null", () => {
  assert.equal(format.effectiveCommissionRate(null, null), null);
  assert.equal(format.effectiveCommissionRate(undefined, undefined), null);
});
