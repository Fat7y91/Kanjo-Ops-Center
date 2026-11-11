import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const voucher = loadTsModule(
  path.join(projectRoot, "src/lib/journal/voucher.ts"),
);

/**
 * The journal voucher is the audit view behind a clickable ledger row. These
 * tests pin the shaping rules the PO asked for: both sides are shown, the party
 * is named, and the voucher amount is the money that moved.
 */

function line(overrides) {
  return {
    id: "line-1",
    code: "1000",
    name: "البنك",
    side: "debit",
    amount: 500,
    memo: "",
    partyType: null,
    partyName: null,
    ...overrides,
  };
}

function entry(overrides) {
  return {
    entryId: "e1",
    entryNo: "42",
    entryDate: "2026-11-10",
    createdAt: "2026-11-10T09:00:00Z",
    memo: "",
    sourceType: "courier_payout",
    sourceId: null,
    currency: "EGP",
    lines: [],
    debitTotal: 0,
    creditTotal: 0,
    parties: { merchants: [], couriers: [] },
    receipt: null,
    ...overrides,
  };
}

test("splitSides separates debit and credit legs", () => {
  const sides = voucher.splitSides([
    line({ id: "a", side: "debit", amount: 500 }),
    line({ id: "b", side: "credit", code: "2100:x", amount: 500 }),
  ]);
  assert.deepEqual(
    sides.debits.map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(
    sides.credits.map((row) => row.id),
    ["b"],
  );
});

test("voucherAmount is the money that moved", () => {
  assert.equal(voucher.voucherAmount(entry({ debitTotal: 500, creditTotal: 500 })), 500);
  assert.equal(voucher.voucherAmount(entry({ debitTotal: 500, creditTotal: 0 })), 500);
});

test("voucherParties deduplicates merchants and couriers", () => {
  const parties = voucher.voucherParties(
    entry({
      parties: {
        merchants: ["مطعم النيل", "مطعم النيل", "كافيه"],
        couriers: ["أحمد"],
      },
    }),
  );
  assert.deepEqual(parties, ["مطعم النيل", "كافيه", "أحمد"]);
});

test("lineLabel prefers the resolved party name", () => {
  assert.equal(
    voucher.lineLabel(line({ name: "merchant KJ-1", partyName: "مطعم النيل" })),
    "مطعم النيل",
  );
});

test("lineLabel falls back to the account name for a control account", () => {
  assert.equal(
    voucher.lineLabel(line({ code: "5400", name: "مصروف تشغيل", partyName: null })),
    "مصروف تشغيل",
  );
});

test("lineLabel names the two bank control accounts", () => {
  assert.equal(
    voucher.lineLabel(line({ code: "1000", name: "البنك", partyName: null })),
    "البنك المصري",
  );
  assert.equal(
    voucher.lineLabel(
      line({ code: "1000-SAR", name: "بنك الرياض", partyName: null }),
    ),
    "البنك السعودي",
  );
});

test("lineLabel ignores a blank party name", () => {
  assert.equal(
    voucher.lineLabel(
      line({ code: "2100", name: "التزامات المناديب", partyName: "   " }),
    ),
    "التزامات المناديب",
  );
});
