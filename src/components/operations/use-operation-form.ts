"use client";

import { useState } from "react";

import type { OperationSummary, PaymentMethod } from "@/lib/operations/types";

type FormState = {
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
 * Form state and submit handler for the operations logger.
 *
 * This is a blind-entry surface: it carries only what an employee can observe
 * at the counter (order, parties, payment method, coupon, manual wallet
 * discount). Profit, commission, balances and the discount split are never in
 * this state and never rendered, so the operator cannot read or forward them.
 * The SQL triggers resolve every financial figure from the contract instead.
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

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: form.orderId,
          merchantId: form.merchantId,
          courierId: form.courierId,
          paymentMethod: form.paymentMethod,
          orderValue: Number(form.orderValue),
          deliveryFee: Number(form.deliveryFee) || 0,
          couponId: form.couponId || null,
          walletDiscount: Number(form.walletDiscount) || 0,
          walletDiscountReason: form.walletDiscountReason,
          walletDiscountRef: form.walletDiscountRef,
          note: form.note,
        }),
      });
      const payload = (await response.json()) as {
        operation?: OperationSummary;
        error?: string;
      };
      if (!response.ok || !payload.operation) {
        setError(payload.error ?? "تعذر تسجيل العملية.");
        return false;
      }
      setOperations((current) => [payload.operation!, ...current]);
      setForm({ ...EMPTY });
      setNotice("تم تسجيل العملية.");
      return true;
    } catch {
      setError("تعذر الاتصال بالخادم.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { form, set, submit, operations, error, notice, busy };
}
