"use client";

import {
  operationDate,
  operationMethodLabel,
  operationMoney,
} from "@/lib/operations/format";
import type { OperationSummary } from "@/lib/operations/types";

/**
 * The operator's own recent entries.
 *
 * A row whose id still carries the `.pending-` prefix is in flight: it is shown
 * muted with a `قيد التسجيل` badge so the optimistic insert is never mistaken
 * for a stored order. Every other row is the row the database returned.
 */
export function OperationRecentList({
  operations,
}: {
  operations: OperationSummary[];
}) {
  if (operations.length === 0) {
    return <p className="muted">لا توجد عمليات مسجلة بعد.</p>;
  }

  return (
    <ul className="operation-list">
      {operations.map((operation) => {
        const pending = operation.id.startsWith(".pending-");
        return (
          <li key={operation.id} data-pending={pending || undefined}>
            <div>
              <strong>{operation.orderId || "—"}</strong>
              <span>
                {operation.merchantName ?? "تاجر"} ·{" "}
                {operation.courierName ?? "مندوب"}
              </span>
              {operation.couponCode ? (
                <span className="muted" dir="ltr">
                  {operation.couponCode}
                </span>
              ) : null}
            </div>
            <div>
              {pending ? (
                <span className="badge badge-gold">قيد التسجيل</span>
              ) : (
                <span className="badge badge-gold">
                  {operationMethodLabel(operation.paymentMethod)}
                </span>
              )}
              <span>
                {operationMoney(operation.orderValue, operation.currency)}
              </span>
              <span className="muted">
                {operationDate(operation.occurredAt)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
