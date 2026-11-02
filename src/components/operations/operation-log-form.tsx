"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menus";
import { TextAreaField, TextField } from "@/components/ui/form-inputs";
import {
  operationDate,
  operationMethodLabel,
  operationMoney,
} from "@/lib/operations/format";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type CourierOption,
  type MerchantOption,
  type OperationLog,
  type PaymentMethod,
} from "@/lib/operations/types";

import { useOperationForm } from "./use-operation-form";

const METHOD_OPTIONS = PAYMENT_METHODS.map((method) => ({
  value: method,
  label: PAYMENT_METHOD_LABEL[method],
}));

export function OperationLogForm({
  couriers,
  merchants,
  initialOperations,
}: {
  couriers: CourierOption[];
  merchants: MerchantOption[];
  initialOperations: OperationLog[];
}) {
  const merchantList = Array.isArray(merchants) ? merchants : [];
  const courierList = Array.isArray(couriers) ? couriers : [];

  // Stable identity so the preview memo only recomputes when the roster or the
  // typed values change, not on every parent render.
  const rates = useMemo(() => {
    const map: Record<string, number> = {};
    for (const merchant of merchantList) {
      map[merchant.id] = merchant.commissionPercent;
    }
    return map;
  }, [merchantList]);

  const { form, set, preview, submit, operations, error, notice, busy } =
    useOperationForm(initialOperations, rates);

  const currency = "EGP" as const;

  return (
    <div className="operation-log">
      <article className="panel">
        <div className="panel-head">
          <h2>تسجيل عملية منفذة</h2>
          <span className="muted">
            العمولة تُحسب من عقد التاجر لحظة التسجيل ولا تتغير بعدها.
          </span>
        </div>

        <div className="form-grid">
          <TextField
            label="رقم الطلب"
            required
            value={form.orderId}
            onChange={(event) => set("orderId", event.target.value)}
            placeholder="ORD-100245"
          />

          <SelectMenu
            label="التاجر"
            required
            value={form.merchantId || null}
            options={merchantList.map((merchant) => ({
              value: merchant.id,
              label: merchant.name,
              hint: `${merchant.commissionPercent}%`,
            }))}
            onChange={(value) => set("merchantId", value)}
          />

          <SelectMenu
            label="المندوب"
            required
            value={form.courierId || null}
            options={courierList.map((courier) => ({
              value: courier.id,
              label: courier.displayName,
              hint: `${courier.cutPercent}%`,
            }))}
            onChange={(value) => set("courierId", value)}
          />

          <SelectMenu
            label="طريقة الدفع"
            required
            value={form.paymentMethod}
            options={METHOD_OPTIONS}
            onChange={(value) => set("paymentMethod", value as PaymentMethod)}
          />

          <TextField
            label="قيمة الطلب"
            required
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.orderValue}
            onChange={(event) => set("orderValue", event.target.value)}
          />

          <TextField
            label="رسوم التوصيل"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.deliveryFee}
            onChange={(event) => set("deliveryFee", event.target.value)}
          />

          <TextField
            label="حصة المندوب"
            hint="اتركها فارغة لتُحسب من نسبة المندوب."
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.courierCut}
            onChange={(event) => set("courierCut", event.target.value)}
          />

          <TextAreaField
            label="ملاحظة"
            rows={2}
            value={form.note}
            onChange={(event) => set("note", event.target.value)}
          />
        </div>

        <div className="operation-preview">
          <span>
            العمولة: <strong>{operationMoney(preview.commission, currency)}</strong>
          </span>
          <span>
            مستحق التاجر:{" "}
            <strong>{operationMoney(preview.merchantShare, currency)}</strong>
          </span>
          <span>
            مستحق المندوب:{" "}
            <strong>{operationMoney(preview.courierShare, currency)}</strong>
          </span>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="form-notice">{notice}</p> : null}

        <div className="form-actions">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "جارٍ التسجيل…" : "تسجيل العملية"}
          </Button>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>آخر العمليات</h2>
          <span className="muted">{operations.length} عملية</span>
        </div>

        {operations.length === 0 ? (
          <p className="muted">لا توجد عمليات مسجلة بعد.</p>
        ) : (
          <ul className="operation-list">
            {operations.map((operation) => (
              <li key={operation.id}>
                <div>
                  <strong>{operation.orderId || "—"}</strong>
                  <span>
                    {operation.merchantName ?? "تاجر"} ·{" "}
                    {operation.courierName ?? "مندوب"}
                  </span>
                </div>
                <div>
                  <span className="badge badge-gold">
                    {operationMethodLabel(operation.paymentMethod)}
                  </span>
                  <span>
                    {operationMoney(operation.orderValue, operation.currency)}
                  </span>
                  <span className="muted">
                    {operationDate(operation.occurredAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
