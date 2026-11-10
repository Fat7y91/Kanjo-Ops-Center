import type { OperationSummary, PaymentMethod } from "./types";

/**
 * Optimistic-row helpers for the operations logger.
 *
 * The logger shows the operator their own entry the instant they submit, then
 * reconciles it with the stored row. A provisional row is a *view* fact: it
 * carries only the fields the employee typed, never a commission, profit or
 * balance, so an in-flight row cannot leak a financial figure either.
 */

export type ProvisionalOperationInput = {
  orderId: string;
  merchantName: string;
  courierName: string;
  paymentMethod: PaymentMethod;
  currency: "EGP" | "SAR";
  orderValue: number;
  deliveryFee: number;
  couponCode: string;
  walletDiscount: number;
  note: string;
};

let sequence = 0;

/**
 * Builds the row shown before the server answers.
 *
 * The id is deliberately namespaced and unique per submission, so a rollback
 * removes exactly this row and a slow success cannot overwrite a newer entry.
 */
export function buildProvisionalOperation(
  input: ProvisionalOperationInput,
): OperationSummary {
  sequence += 1;
  return {
    id: `.pending-${Date.now()}-${sequence}`,
    orderId: input.orderId,
    merchantName: input.merchantName,
    courierName: input.courierName,
    paymentMethod: input.paymentMethod,
    currency: input.currency,
    orderValue: input.orderValue,
    deliveryFee: input.deliveryFee,
    couponCode: input.couponCode,
    walletDiscount: input.walletDiscount,
    note: input.note,
    occurredAt: new Date().toISOString(),
  };
}

/** Resolves a display label for the party the operator picked. */
export function pickLabel<Row extends { id: string }>(
  rows: Row[],
  id: string,
  label: (row: Row) => string,
  fallback: string,
): string {
  if (!id) return fallback;
  const row = rows.find((candidate) => candidate.id === id);
  const value = row ? label(row).trim() : "";
  return value || fallback;
}

/**
 * True for the transport failures that arrive as an abort.
 *
 * A request can be aborted by its own timeout or by the browser unloading the
 * page. Both are connection outcomes the operator must see, not silent states,
 * so the submit path classifies them instead of discarding them.
 */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const name = "name" in error ? (error as { name?: unknown }).name : undefined;
  if (name === "AbortError" || name === "TimeoutError") return true;

  const message =
    "message" in error ? (error as { message?: unknown }).message : undefined;
  return typeof message === "string" && /abort/i.test(message);
}

/**
 * Operator-facing message for a failed submit.
 *
 * A timeout is ambiguous: the request may have reached the database after the
 * browser gave up. The message says so and points at the unique order number,
 * so the operator verifies instead of re-posting blind. A non-timeout transport
 * failure is unambiguous and states the order was not recorded.
 */
export function submitErrorMessage(error: unknown): string {
  if (isAbortError(error)) {
    return "انتهت مهلة الإرسال قبل وصول الرد. تحقّق من آخر العمليات قبل إعادة المحاولة؛ رقم الطلب لا يُسجَّل مرتين.";
  }
  return "تعذر إرسال العملية إلى الخادم. لم تُسجَّل؛ أعد المحاولة.";
}
