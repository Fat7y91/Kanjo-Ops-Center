import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const ops = loadTsModule(path.join(projectRoot, "src/lib/operations/types.ts"));

/**
 * The operations table shows the commission frozen onto each order so a silent
 * zero is visible. Courier profit, balances and the coupon funding split stay
 * off the summary. `toOperationSummary` is the boundary, so these tests pin
 * exactly which fields may cross it.
 */

const FULL_OPERATION = {
  id: "op-1",
  orderId: "ORD-100245",
  merchantId: "merchant-1",
  merchantName: "مطعم النيل",
  courierId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  courierName: "أحمد",
  paymentMethod: "COD",
  currency: "EGP",
  orderValue: 250,
  deliveryFee: 20,
  commissionPercent: 12,
  commission: 30,
  merchantCommissionPercent: 15,
  courierCutPercent: 0,
  courierCut: 15,
  couponCode: "WELCOME10",
  couponDiscount: 10,
  couponShippingDiscount: 0,
  couponCashback: 0,
  couponPlatformFunded: 10,
  couponVendorFunded: 0,
  walletDiscount: 5,
  walletDiscountReason: "رصيد مرحّب",
  walletDiscountRef: "REF-9",
  note: "",
  occurredAt: "2026-11-10T09:00:00Z",
  createdAt: "2026-11-10T09:00:00Z",
};

test("summary carries the applied commission beside the typed fields", () => {
  const summary = ops.toOperationSummary(FULL_OPERATION);
  assert.deepEqual(Object.keys(summary).sort(), [
    "commission",
    "commissionPercent",
    "couponCode",
    "courierName",
    "currency",
    "deliveryFee",
    "id",
    "merchantCommissionPercent",
    "merchantName",
    "note",
    "occurredAt",
    "orderId",
    "orderValue",
    "paymentMethod",
    "walletDiscount",
  ]);
});

test("summary never carries courier profit or the coupon split", () => {
  const summary = ops.toOperationSummary(FULL_OPERATION);
  for (const hidden of [
    "courierCut",
    "courierCutPercent",
    "couponPlatformFunded",
    "couponVendorFunded",
    "couponDiscount",
    "couponCashback",
  ]) {
    assert.equal(hidden in summary, false, hidden);
  }
});

test("summary carries the commission values through unchanged", () => {
  const summary = ops.toOperationSummary(FULL_OPERATION);
  assert.equal(summary.commissionPercent, 12);
  assert.equal(summary.commission, 30);
  assert.equal(summary.merchantCommissionPercent, 15);
});

test("summary carries the values through unchanged", () => {
  const summary = ops.toOperationSummary(FULL_OPERATION);
  assert.equal(summary.orderValue, 250);
  assert.equal(summary.deliveryFee, 20);
  assert.equal(summary.couponCode, "WELCOME10");
  assert.equal(summary.walletDiscount, 5);
});

test("the log input accepts an optional coupon and wallet discount", () => {
  const parsed = ops.operationLogInputSchema.parse({
    orderId: "ORD-1",
    merchantId: "merchant-1",
    courierId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    paymentMethod: "COD",
    orderValue: 100,
    deliveryFee: 0,
    couponId: null,
    walletDiscount: 0,
  });
  assert.equal(parsed.couponId, null);
  assert.equal(parsed.walletDiscount, 0);
  assert.equal(parsed.walletDiscountReason, "");
});

test("the log input rejects a negative wallet discount", () => {
  assert.throws(() =>
    ops.operationLogInputSchema.parse({
      orderId: "ORD-1",
      merchantId: "merchant-1",
      courierId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      paymentMethod: "COD",
      orderValue: 100,
      walletDiscount: -5,
    }),
  );
});

test("the commission override accepts zero and decimals", () => {
  assert.equal(
    ops.orderCommissionInputSchema.parse({ commissionRate: 0 }).commissionRate,
    0,
  );
  assert.equal(
    ops.orderCommissionInputSchema.parse({ commissionRate: 12.5 }).commissionRate,
    12.5,
  );
});

test("the commission override rejects negative and above-100 rates", () => {
  assert.throws(() =>
    ops.orderCommissionInputSchema.parse({ commissionRate: -1 }),
  );
  assert.throws(() =>
    ops.orderCommissionInputSchema.parse({ commissionRate: 101 }),
  );
});
