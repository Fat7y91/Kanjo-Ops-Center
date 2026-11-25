import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const rules = loadTsModule(
  path.join(projectRoot, "src/lib/operations/manual-adjustment.ts"),
);
const errors = loadTsModule(
  path.join(projectRoot, "src/lib/operations/errors.ts"),
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

test("a ledger account UUID is accepted as-is", () => {
  const uuid = "1ec0e91d-d82a-4fed-a11b-7e710439e87a";
  assert.deepEqual(rules.parseAdjustmentAccountRef(` ${uuid} `), {
    kind: "account",
    accountId: uuid,
  });
});

test("prefixed party references resolve to the party side", () => {
  assert.deepEqual(
    rules.parseAdjustmentAccountRef("courier:1ec0e91d-d82a-4fed-a11b-7e710439e87a"),
    {
      kind: "party",
      partyType: "courier",
      partyId: "1ec0e91d-d82a-4fed-a11b-7e710439e87a",
    },
  );
  assert.deepEqual(rules.parseAdjustmentAccountRef(" merchant : KJ-37CKK7 "), {
    kind: "party",
    partyType: "merchant",
    partyId: "KJ-37CKK7",
  });
});

test("malformed account references are rejected before hitting Postgres", () => {
  for (const bad of ["", "   ", "not-a-uuid", "courier:", "merchant:   ", null, 42]) {
    assert.equal(rules.parseAdjustmentAccountRef(bad), null);
  }
});

test("businessDate is accepted as an alias for entryDate", () => {
  const fromBusinessDate = rules.normalizeManualAdjustmentPayload({
    direction: "credit",
    amount: "150.50",
    businessDate: "2026-11-25",
    reason: "مكافأة التزام",
  });
  assert.deepEqual(fromBusinessDate, {
    direction: "credit",
    amount: "150.50",
    entryDate: "2026-11-25",
    reason: "مكافأة التزام",
  });

  const explicit = rules.normalizeManualAdjustmentPayload({
    entryDate: "2026-11-01",
    businessDate: "2026-11-25",
  });
  assert.equal(explicit.entryDate, "2026-11-01");
  assert.deepEqual(rules.normalizeManualAdjustmentPayload(null), {});
});

test("database failures map to clear HTTP statuses instead of a generic 500", () => {
  const marker = errors.fromDatabaseError({
    code: "23514",
    message: "ADJUSTMENT_AMOUNT_INVALID: amount must be positive",
  });
  assert.equal(marker.status, 422);
  assert.equal(marker.code, "ADJUSTMENT_AMOUNT_INVALID");

  assert.equal(errors.fromDatabaseError({ code: "23502" }).status, 422);
  assert.equal(errors.fromDatabaseError({ code: "23503" }).status, 422);
  assert.equal(errors.fromDatabaseError({ code: "22P02" }).status, 422);
  assert.equal(errors.fromDatabaseError({ code: "42501" }).status, 403);
  assert.equal(errors.fromDatabaseError({ code: "PGRST202" }).status, 503);
  assert.equal(errors.fromDatabaseError({ code: "42883" }).status, 503);
});
