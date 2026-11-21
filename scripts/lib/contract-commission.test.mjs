import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { resolveContractCommissionRate } = loadTsModule(
  path.join(projectRoot, "src/lib/contracts/commission.ts"),
);

test("the contract's own base rate wins over the merchant rate", () => {
  assert.equal(resolveContractCommissionRate(12, 15, 20), 12);
});

test("without a base rate the agreed merchant rate is used", () => {
  assert.equal(resolveContractCommissionRate(null, 15, 20), 15);
});

test("an unsigned merchant falls back to its target rate", () => {
  assert.equal(resolveContractCommissionRate(null, null, 15), 15);
});

test("a zero base rate is a real rate, not a missing one", () => {
  assert.equal(resolveContractCommissionRate(0, 15, 20), 0);
});

test("no rate at all resolves to null so the table can show a dash", () => {
  assert.equal(resolveContractCommissionRate(null, null, null), null);
  assert.equal(
    resolveContractCommissionRate(Number.NaN, undefined, undefined),
    null,
  );
});
