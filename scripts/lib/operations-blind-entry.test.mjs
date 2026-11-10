import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const ops = loadTsModule(path.join(projectRoot, "src/lib/operations/types.ts"));

/**
 * The operations logger is a blind-entry surface: the employee must not be able
 * to read commission, courier profit, balances or the coupon funding split.
 * `toOperationSummary` is the boundary that guarantees it, so these tests pin
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

test("summary keeps only what the employee typed", () => {
  const summary = ops.toOperationSummary(FULL_OPERATION);
  assert.deepEqual(Object.keys(summary).sort(), [
    "couponCode",
    "courierName",
    "currency",
    "deliveryFee",
    "id",
    "merchantName",
    "note",
    "occurredAt",
    "orderId",
    "orderValue",
    "paymentMethod",
    "walletDiscount",
  ]);
});

test("summary never carries commission or courier profit", () => {
  const summary = ops.toOperationSummary(FULL_OPERATION);
  for (const hidden of [
    "commission",
    "commissionPercent",
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
