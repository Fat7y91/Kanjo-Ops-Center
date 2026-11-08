import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { isContractDraftEligible, isContractMerchantInScope } = loadTsModule(
  path.join(projectRoot, "src/lib/contracts/eligibility.ts"),
);

test("drafting is allowed for provisional and final agreements", () => {
  assert.equal(isContractDraftEligible("provisional"), true);
  assert.equal(isContractDraftEligible("final_contract"), true);
});

test("drafting is refused for no_agreement and signed_contract", () => {
  assert.equal(isContractDraftEligible("no_agreement"), false);
  assert.equal(isContractDraftEligible("signed_contract"), false);
});

test("a VIP merchant is eligible regardless of agreement state", () => {
  assert.equal(isContractDraftEligible("no_agreement", true), true);
  assert.equal(isContractDraftEligible("signed_contract", true), true);
  assert.equal(isContractDraftEligible("provisional", false), true);
});

test("an unknown state is never eligible on its own", () => {
  assert.equal(isContractDraftEligible("unexpected"), false);
});

test("a merchant with a city is scoped to that city", () => {
  const allowed = new Set(["city-desouk"]);
  assert.equal(isContractMerchantInScope("city-desouk", allowed), true);
  assert.equal(isContractMerchantInScope("city-cairo", allowed), false);
});

test("a merchant with no city is network-wide", () => {
  assert.equal(isContractMerchantInScope(null, new Set()), true);
});
