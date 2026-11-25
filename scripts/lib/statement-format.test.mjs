import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const accounts = loadTsModule(
  path.join(projectRoot, "src/lib/accounts/format.ts"),
);
const operations = loadTsModule(
  path.join(projectRoot, "src/lib/operations/format.ts"),
);

/**
 * The statement row must let a merchant match a POS order at a glance, so the
 * order number, Cairo clock time, subtotal and commission rate are pinned here.
 */

test("merchant order rows name the order, value and commission", () => {
  const text = operations.statementLineDescription(
    {
      id: "line-1",
      entryId: "entry-1",
      date: "2026-11-19",
      reference: "عملية 149257",
      memo: "عمولة مستحقة على التاجر",
      debit: 22.5,
      credit: 0,
      running: 22.5,
      orderNumber: "149257",
      occurredAt: "2026-11-19T18:15:00Z",
      orderValue: 150,
      commissionPercent: 15,
    },
    "EGP",
  );

  assert.ok(text.startsWith("طلب #149257 — قيمة الطلب:"));
  assert.ok(text.includes(accounts.currencyMoney(150, "EGP")));
  assert.ok(text.includes("(عمولة 15%)"));
  assert.ok(!text.includes("المندوب:"));
});

test("merchant order rows name the assigned courier", () => {
  const text = operations.statementLineDescription(
    {
      id: "line-1b",
      entryId: "entry-1b",
      date: "2026-11-19",
      reference: "عملية 149257",
      memo: "عمولة مستحقة على التاجر",
      debit: 22.5,
      credit: 0,
      running: 22.5,
      orderNumber: "149257",
      occurredAt: "2026-11-19T18:15:00Z",
      orderValue: 150,
      commissionPercent: 15,
      courierName: "يوسف علي",
    },
    "EGP",
  );

  assert.ok(text.startsWith("طلب #149257 · المندوب: يوسف علي — قيمة الطلب:"));
  assert.ok(text.includes(accounts.currencyMoney(150, "EGP")));
});

test("a blank courier name leaves the tag off", () => {
  const text = operations.statementLineDescription({
    id: "line-1c",
    entryId: "entry-1c",
    date: "2026-11-19",
    reference: "عملية 149257",
    memo: "عمولة مستحقة على التاجر",
    debit: 22.5,
    credit: 0,
    running: 22.5,
    orderNumber: "149257",
    orderValue: 150,
    commissionPercent: 15,
    courierName: "   ",
  });

  assert.ok(!text.includes("المندوب:"));
});

test("statementLineParts exposes the courier separately from the sentence", () => {
  const parts = operations.statementLineParts({
    id: "line-1d",
    entryId: "entry-1d",
    date: "2026-11-19",
    reference: "عملية 149257",
    memo: "عمولة مستحقة على التاجر",
    debit: 22.5,
    credit: 0,
    running: 22.5,
    orderNumber: "149257",
    orderValue: 150,
    commissionPercent: 15,
    courierName: "يوسف علي",
  });

  assert.equal(parts.lead, "طلب #149257");
  assert.equal(parts.courierName, "يوسف علي");
  assert.ok(parts.tail.startsWith(" — قيمة الطلب:"));
});

test("statementOrderCountLabel respects Arabic plural forms", () => {
  assert.equal(operations.statementOrderCountLabel(0), "0 طلب");
  assert.equal(operations.statementOrderCountLabel(1), "1 طلب");
  assert.equal(operations.statementOrderCountLabel(2), "2 طلبات");
  assert.equal(operations.statementOrderCountLabel(10), "10 طلبات");
  assert.equal(operations.statementOrderCountLabel(11), "11 طلب");
  assert.equal(operations.statementOrderCountLabel(120), "120 طلب");
});

test("the exact Cairo clock time is shown without Arabic-Indic digits", () => {
  assert.equal(
    accounts.cairoDateTime("2026-11-19T18:15:00Z"),
    "19 نوفمبر 2026 · 08:15 م",
  );
});

test("a courier order row keeps its net-order breakdown", () => {
  const text = operations.statementLineDescription({
    id: "line-2",
    entryId: "entry-2",
    date: "2026-11-19",
    reference: "عملية 149250",
    memo: "صافي الطلب: قيمة 260.00 − محصّل 229.00 + أجر 7.00",
    debit: 0,
    credit: 38,
    running: -38,
    orderNumber: "149250",
    occurredAt: "2026-11-19T08:00:00Z",
    orderValue: 260,
    commissionPercent: null,
  });

  assert.ok(text.startsWith("طلب #149250 (قيمة 260"));
});
