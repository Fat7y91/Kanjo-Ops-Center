import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const model = loadTsModule(
  path.join(projectRoot, "src/lib/operations/statement-sheet-model.ts"),
);

function merchantStatement(overrides = {}) {
  return {
    accountId: "account-1",
    partyType: "merchant",
    partyId: "merchant-1",
    partyName: "مطعم الكرم",
    currency: "EGP",
    balance: -22.5,
    orderCount: 3,
    openingBalance: 0,
    period: { from: "2026-11-01", to: "2026-11-30" },
    lines: [
      {
        id: "line-1",
        entryId: "entry-1",
        date: "2026-11-19",
        reference: "عملية 149677",
        memo: "عمولة مستحقة على التاجر",
        debit: 22.5,
        credit: 0,
        running: 22.5,
        orderNumber: "149677",
        occurredAt: "2026-11-19T18:15:00Z",
        orderValue: 150,
        commissionPercent: 15,
        courierName: "يوسف علي",
      },
    ],
    ...overrides,
  };
}

test("merchant sheets add a courier column and a clean order reference", () => {
  const sheet = model.buildStatementSheet(merchantStatement());

  assert.deepEqual(sheet.headers, [
    "التاريخ",
    "المرجع",
    "مندوب التوصيل",
    "مدين",
    "دائن",
    "الرصيد",
  ]);
  assert.equal(sheet.amountStart, 4);
  assert.equal(sheet.referenceColumn, 2);
  assert.equal(sheet.rows[0][1], "طلب #149677");
  assert.equal(sheet.rows[0][2], "يوسف علي");
  assert.equal(sheet.orderCountLabel, "3 طلبات");
  assert.equal(sheet.totals.length, 6);
  assert.deepEqual(sheet.totals.slice(3), [22.5, 0, -22.5]);
});

test("a merchant order with no recorded courier shows a neutral cell", () => {
  const sheet = model.buildStatementSheet(
    merchantStatement({
      lines: [
        {
          id: "line-2",
          entryId: "entry-2",
          date: "2026-11-19",
          reference: "عملية 149678",
          memo: "عمولة مستحقة على التاجر",
          debit: 15,
          credit: 0,
          running: 15,
          orderNumber: "149678",
          orderValue: 100,
          courierName: null,
        },
      ],
    }),
  );

  assert.equal(sheet.rows[0][2], "—");
});

test("courier sheets keep the five-column layout and net-order memo", () => {
  const sheet = model.buildStatementSheet({
    accountId: "account-2",
    partyType: "courier",
    partyId: "courier-1",
    partyName: "يوسف علي",
    currency: "EGP",
    balance: 38,
    orderCount: 1,
    openingBalance: 0,
    workingDays: 4,
    period: { from: null, to: null },
    lines: [
      {
        id: "line-3",
        entryId: "entry-3",
        date: "2026-11-19",
        reference: "عملية 149250",
        memo: "صافي الطلب: قيمة 260.00 − محصّل 229.00 + أجر 7.00",
        debit: 0,
        credit: 38,
        running: -38,
        orderNumber: "149250",
      },
    ],
  });

  assert.deepEqual(sheet.headers, ["التاريخ", "المرجع", "مدين", "دائن", "الرصيد"]);
  assert.equal(sheet.amountStart, 3);
  assert.ok(String(sheet.rows[0][1]).includes("صافي الطلب"));
  assert.ok(String(sheet.rows[0][1]).includes("149250"));
  assert.equal(sheet.orderCountLabel, "1 طلب");
  assert.equal(sheet.totals.length, 5);
});
