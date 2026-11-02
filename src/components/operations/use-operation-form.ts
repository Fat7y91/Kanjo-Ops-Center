"use client";

import { useMemo, useState } from "react";

import { toMinorUnits } from "@/lib/operations/types";
import type { OperationLog, PaymentMethod } from "@/lib/operations/types";

type FormState = {
  orderId: string;
  merchantId: string;
  courierId: string;
  paymentMethod: PaymentMethod;
  orderValue: string;
  deliveryFee: string;
  courierCut: string;
  note: string;
};

const EMPTY: FormState = {
  orderId: "",
  merchantId: "",
  courierId: "",
  paymentMethod: "COD",
  orderValue: "",
  deliveryFee: "",
  courierCut: "",
  note: "",
};

/**
 * Form state and submit handler for the operations logger.
 *
 * Kept apart from the render module so the form body stays a pure presentation
 * of state. The commission is deliberately not part of the form: the database
 * resolves it from the merchant contract, so the preview here is advisory.
 */
export function useOperationForm(
  initialOperations: OperationLog[],
  merchantRates: Record<string, number>,
) {
  const [form, setForm] = useState<FormState>(EMPTY);
  // The page degrades to empty arrays when the schema is not reachable, but a
  // direct/mocked caller could still omit the prop; never let `undefined`
  // reach `.length` or `.map` in the render.
  const [operations, setOperations] = useState<OperationLog[]>(
    Array.isArray(initialOperations) ? initialOperations : [],
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const preview = useMemo(() => {
    const value = Number(form.orderValue) || 0;
    const rate = Number(merchantRates[form.merchantId] ?? 0) || 0;
    const commission = toMinorUnits((value * rate) / 100) / 100;
    const delivery = Number(form.deliveryFee) || 0;
    const cut = Number(form.courierCut) || 0;
    return {
      commission,
      merchantShare:
        form.paymentMethod === "COD" ? -commission : value - commission,
      courierShare:
        form.paymentMethod === "COD" ? -(delivery - cut) : cut,
    };
  }, [form, merchantRates]);

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
          courierCut: Number(form.courierCut) || 0,
          note: form.note,
        }),
      });
      const payload = (await response.json()) as {
        operation?: OperationLog;
        error?: string;
      };
      if (!response.ok || !payload.operation) {
        setError(payload.error ?? "تعذر تسجيل العملية.");
        return false;
      }
      setOperations((current) => [payload.operation!, ...current]);
      setForm({ ...EMPTY });
      setNotice("تم تسجيل العملية وتوجيه قيود المقاصة.");
      return true;
    } catch {
      setError("تعذر الاتصال بالخادم.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { form, set, preview, submit, operations, error, notice, busy };
}
