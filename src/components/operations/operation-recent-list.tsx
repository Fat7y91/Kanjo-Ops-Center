"use client";

import {
  operationDate,
  operationMethodLabel,
  operationMoney,
} from "@/lib/operations/format";
import type { OperationSummary } from "@/lib/operations/types";

/**
 * The operator's own recent entries, read like a bank statement.
 *
 * Each row answers the two questions a statement must answer without a legend:
 * *who paid whom* (source → destination) and *how much moved* (a signed,
 * colour-coded amount). The route follows the money:
 *
 *   COD     cash collected by the courier is handed to the merchant, so the
 *           movement reads "from the courier, to the merchant"
 *   ONLINE  Kanjo received the customer's payment electronically and owes the
 *           merchant, so the movement reads "from Kanjo, to the merchant"
 *
 * This is still a blind-entry surface: the row carries only what the employee
 * typed — order value, delivery fee, wallet discount — never a commission,
 * profit, split or balance.
 *
 * A row whose id still carries the `.pending-` prefix is in flight: it is shown
 * muted with a `قيد التسجيل` badge so the optimistic insert is never mistaken
 * for a stored order.
 */

function netCollected(operation: OperationSummary): number {
  return (
    operation.orderValue + operation.deliveryFee - operation.walletDiscount
  );
}

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
        const cod = operation.paymentMethod === "COD";
        const money = (value: number) =>
          operationMoney(value, operation.currency);
        const collected = netCollected(operation);

        return (
          <li key={operation.id} data-pending={pending || undefined}>
            <div className="operation-row-main">
              <div className="operation-row-route">
                <span className="operation-party">
                  <span className="operation-party-role">من</span>
                  <strong>
                    {cod
                      ? operation.courierName || "مندوب التوصيل"
                      : "كانجو"}
                  </strong>
                </span>
                <span className="operation-row-arrow" aria-hidden="true">
                  ←
                </span>
                <span className="operation-party">
                  <span className="operation-party-role">إلى</span>
                  <strong>{operation.merchantName || "تاجر"}</strong>
                </span>
              </div>

              <span className="operation-row-ref">
                <span dir="ltr">{operation.orderId || "—"}</span>
                <span className="operation-row-dot" aria-hidden="true">
                  ·
                </span>
                <span>{operationMethodLabel(operation.paymentMethod)}</span>
                {!cod && operation.courierName ? (
                  <>
                    <span className="operation-row-dot" aria-hidden="true">
                      ·
                    </span>
                    <span>مندوب التوصيل {operation.courierName}</span>
                  </>
                ) : null}
                {operation.couponCode ? (
                  <>
                    <span className="operation-row-dot" aria-hidden="true">
                      ·
                    </span>
                    <span dir="ltr">كوبون {operation.couponCode}</span>
                  </>
                ) : null}
              </span>

              <span className="operation-row-breakdown">
                <span>{money(operation.orderValue)} قيمة الطلب</span>
                {operation.deliveryFee > 0 ? (
                  <span>+ {money(operation.deliveryFee)} توصيل</span>
                ) : null}
                {operation.walletDiscount > 0 ? (
                  <span className="operation-row-deduction">
                    − {money(operation.walletDiscount)} خصم محفظة
                  </span>
                ) : null}
              </span>

              {operation.note ? (
                <span className="muted operation-row-note">
                  {operation.note}
                </span>
              ) : null}
            </div>

            <div className="operation-row-amount">
              {pending ? (
                <span className="badge badge-gold">قيد التسجيل</span>
              ) : (
                <span
                  className={`badge ${cod ? "badge-green" : "badge-blue"}`}
                >
                  {cod ? "نقدي محصّل" : "دفع إلكتروني"}
                </span>
              )}
              <strong className="operation-amount operation-amount-credit">
                + {money(collected)}
              </strong>
              <span className="muted operation-row-date">
                {operationDate(operation.occurredAt)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
