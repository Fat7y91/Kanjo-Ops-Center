import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const optimistic = loadTsModule(
  path.join(projectRoot, "src/lib/operations/optimistic.ts"),
);

/**
 * Failure paths for the logging form.
 *
 * The operator sees their entry immediately. Every abort — timeout, offline,
 * unload — must be classifiable so the row can be reverted and the operator
 * told the order was not recorded. Swallowing an abort is what left the list
 * showing a success that never happened.
 */

test("an abort raised by a timeout is recognised", () => {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  assert.equal(optimistic.isAbortError(error), true);
});

test("a TimeoutError counts as an abort", () => {
  const error = new Error("signal timed out");
  error.name = "TimeoutError";
  assert.equal(optimistic.isAbortError(error), true);
});

test("an abort message without the name still counts", () => {
  assert.equal(
    optimistic.isAbortError(new Error("signal is aborted without reason")),
    true,
  );
});

test("a plain network failure is not an abort but still reverts", () => {
  assert.equal(optimistic.isAbortError(new TypeError("Failed to fetch")), false);
  const message = optimistic.submitErrorMessage(new TypeError("Failed to fetch"));
  // The message must state that nothing was recorded, so a reverted row is not
  // read as a silent disappearance.
  assert.match(message, /لم تُسجَّل/);
});

test("the abort message warns the operator to verify before retrying", () => {
  const error = new Error("aborted");
  error.name = "AbortError";
  const message = optimistic.submitErrorMessage(error);
  // A timeout is ambiguous, so the copy must not promise the write failed and
  // must point at the order number that keeps a retry from duplicating it.
  assert.match(message, /مهلة/);
  assert.match(message, /رقم الطلب/);
});

test("a provisional row carries only what the employee typed", () => {
  const row = optimistic.buildProvisionalOperation({
    orderId: "ORD-1",
    merchantName: "مطعم النيل",
    courierName: "أحمد",
    paymentMethod: "COD",
    currency: "EGP",
    orderValue: 250,
    deliveryFee: 20,
    couponCode: "WELCOME10",
    walletDiscount: 5,
    note: "",
  });

  assert.deepEqual(Object.keys(row).sort(), [
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

test("every provisional id is unique so a rollback removes one row", () => {
  const input = {
    orderId: "ORD-1",
    merchantName: "تاجر",
    courierName: "مندوب",
    paymentMethod: "COD",
    currency: "EGP",
    orderValue: 100,
    deliveryFee: 0,
    couponCode: "",
    walletDiscount: 0,
    note: "",
  };
  const first = optimistic.buildProvisionalOperation(input);
  const second = optimistic.buildProvisionalOperation(input);

  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^\.pending-/);
});

test("pickLabel resolves the chosen party and falls back safely", () => {
  const rows = [
    { id: "a", name: "تاجر أ" },
    { id: "b", name: "تاجر ب" },
  ];
  assert.equal(
    optimistic.pickLabel(rows, "b", (row) => row.name, "تاجر"),
    "تاجر ب",
  );
  assert.equal(
    optimistic.pickLabel(rows, "missing", (row) => row.name, "تاجر"),
    "تاجر",
  );
  assert.equal(optimistic.pickLabel(rows, "", (row) => row.name, "تاجر"), "تاجر");
});
