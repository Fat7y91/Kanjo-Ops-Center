"use client";

import { useCallback, useRef, useState } from "react";

import {
  buildProvisionalOperation,
  submitErrorMessage,
  type ProvisionalOperationInput,
} from "@/lib/operations/optimistic";
import type { OperationSummary, PaymentMethod } from "@/lib/operations/types";

export type FormState = {
  orderId: string;
  merchantId: string;
  courierId: string;
  paymentMethod: PaymentMethod;
  orderValue: string;
  deliveryFee: string;
  couponId: string;
  walletDiscount: string;
  walletDiscountReason: string;
  walletDiscountRef: string;
  note: string;
};

const EMPTY: FormState = {
  orderId: "",
  merchantId: "",
  courierId: "",
  paymentMethod: "COD",
  orderValue: "",
  deliveryFee: "",
  couponId: "",
  walletDiscount: "",
  walletDiscountReason: "",
  walletDiscountRef: "",
  note: "",
};

/**
 * How long the client waits for the stored row before it gives up.
 *
 * The write is a single insert plus SQL triggers, so it should answer in well
 * under a second. A generous ceiling still guarantees the operator is told the
 * entry did not land instead of watching a spinner forever.
 */
const SUBMIT_TIMEOUT_MS = 20_000;

/** Field-wise equality, used to avoid clearing edits typed during the request. */
function sameForm(left: FormState, right: FormState): boolean {
  return (Object.keys(left) as (keyof FormState)[]).every(
    (key) => left[key] === right[key],
  );
}

export type OperationLabels = {
  merchantName: string;
  courierName: string;
  couponCode: string;
};

async function readPayload(response: Response): Promise<{
  operation?: OperationSummary;
  error?: string;
}> {
  try {
    return (await response.json()) as {
      operation?: OperationSummary;
      error?: string;
    };
  } catch {
    return {};
  }
}

/**
 * Form state and submit handler for the operations logger.
 *
 * This is a blind-entry surface: it carries only what an employee can observe
 * at the counter (order, parties, payment method, coupon, manual wallet
 * discount). Profit, commission, balances and the discount split are never in
 * this state and never rendered, so the operator cannot read or forward them.
 * The SQL triggers resolve every financial figure from the contract instead.
 *
 * A submit shows the order immediately and removes it again if the write fails
 * for any reason — including an aborted request. The row is never left standing
 * on a failure, so a refresh is not required to reveal the truth.
 */
export function useOperationForm(initialOperations: OperationSummary[]) {
  const [form, setForm] = useState<FormState>(EMPTY);
  // The page degrades to an empty array when the schema is not reachable, but a
  // direct/mocked caller could still omit the prop; never let `undefined` reach
  // `.length` or `.map` in the render.
  const [operations, setOperations] = useState<OperationSummary[]>(
    Array.isArray(initialOperations) ? initialOperations : [],
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // A render-scoped `busy` guard loses to two clicks dispatched in the same
  // tick; the ref makes the in-flight window atomic so one order cannot be
  // posted twice.
  const inFlight = useRef(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(labels: OperationLabels) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    // Snapshot the submitted values: the operator may start the next order
    // while this one is in flight, and that work must not be lost or sent.
    const snapshot = form;
    const provisionalInput: ProvisionalOperationInput = {
      orderId: snapshot.orderId,
      merchantName: labels.merchantName,
      courierName: labels.courierName,
      paymentMethod: snapshot.paymentMethod,
      currency: "EGP",
      orderValue: Number(snapshot.orderValue),
      deliveryFee: Number(snapshot.deliveryFee) || 0,
      couponCode: labels.couponCode,
      walletDiscount: Number(snapshot.walletDiscount) || 0,
      note: snapshot.note,
    };
    // Show the entry instantly, then keep its id so a failure removes exactly
    // this row and a success swaps it for the stored one.
    const provisional = buildProvisionalOperation(provisionalInput);
    setOperations((current) => [provisional, ...current]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: snapshot.orderId,
          merchantId: snapshot.merchantId,
          courierId: snapshot.courierId,
          paymentMethod: snapshot.paymentMethod,
          orderValue: Number(snapshot.orderValue),
          deliveryFee: Number(snapshot.deliveryFee) || 0,
          couponId: snapshot.couponId || null,
          walletDiscount: Number(snapshot.walletDiscount) || 0,
          walletDiscountReason: snapshot.walletDiscountReason,
          walletDiscountRef: snapshot.walletDiscountRef,
          note: snapshot.note,
        }),
        signal: controller.signal,
      });
      const payload = await readPayload(response);

      if (!response.ok || !payload.operation) {
        setOperations((current) =>
          current.filter((row) => row.id !== provisional.id),
        );
        setError(payload.error ?? "تعذر تسجيل العملية.");
        return false;
      }

      // Replace the provisional row with the stored one in place, so the list
      // keeps its order and the id becomes the real record id.
      const stored = payload.operation;
      setOperations((current) =>
        current.map((row) => (row.id === provisional.id ? stored : row)),
      );
      setForm((current) =>
        sameForm(current, snapshot) ? { ...EMPTY } : current,
      );
      setNotice("تم تسجيل العملية.");
      return true;
    } catch (caught) {
      // Every failure — offline, timeout, abort, malformed body — reverts the
      // optimistic row and reports it. The list never claims a write happened.
      setOperations((current) =>
        current.filter((row) => row.id !== provisional.id),
      );
      setError(submitErrorMessage(caught));
      return false;
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      setBusy(false);
    }
  }

  const dismissNotice = useCallback(() => setNotice(""), []);
  const dismissError = useCallback(() => setError(""), []);

  return {
    form,
    set,
    submit,
    operations,
    error,
    notice,
    busy,
    dismissNotice,
    dismissError,
  };
}
