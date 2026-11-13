"use client";

import { Checkbox } from "@headlessui/react";

import { Button } from "@/components/ui/button";
import {
  operationDate,
  operationMethodLabel,
  operationMoney,
} from "@/lib/operations/format";
import type { OperationSummary } from "@/lib/operations/types";

function netCollected(operation: OperationSummary): number {
  return (
    operation.orderValue + operation.deliveryFee - operation.walletDiscount
  );
}

const CHECKBOX_CLASS =
  "grid size-4 shrink-0 place-items-center rounded border-0 bg-[color:var(--surface-soft)] text-white ring-1 ring-inset ring-[color:var(--kanjo-field-border)] transition duration-200 ease-out data-[checked]:bg-[color:var(--kanjo-purple-interactive)] data-[checked]:ring-[color:var(--kanjo-purple-interactive)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)]";

/**
 * Orders table with selection and deletion.
 *
 * The row still reads like a statement: who paid whom, how much moved and on
 * which date. It never shows commission, courier profit or balances. Deleting
 * hides the row from this screen while the append-only log keeps the evidence.
 */
export function OperationRecentList({
  operations,
  canDelete,
  selected,
  onToggle,
  onToggleAll,
  onDelete,
  deleting,
}: {
  operations: OperationSummary[];
  canDelete: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onDelete: (ids: string[]) => void;
  deleting: boolean;
}) {
  if (operations.length === 0) {
    return <p className="empty-state">لا توجد عمليات مسجلة بعد.</p>;
  }

  const allSelected =
    operations.length > 0 && operations.every((row) => selected.has(row.id));
  const selectedIds = operations
    .filter((row) => selected.has(row.id))
    .map((row) => row.id);

  return (
    <>
      {canDelete && selectedIds.length > 0 ? (
        <div className="inline-note" role="status">
          <strong>{selectedIds.length} طلب محدد</strong>
          <Button
            size="sm"
            variant="danger"
            disabled={deleting}
            onClick={() => onDelete(selectedIds)}
          >
            {deleting ? "جارٍ الحذف…" : "حذف المحدد"}
          </Button>
        </div>
      ) : null}

      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {canDelete ? (
                <th className="align-center">
                  <Checkbox
                    aria-label="تحديد كل الطلبات"
                    className={CHECKBOX_CLASS}
                    checked={allSelected}
                    onChange={onToggleAll}
                  />
                </th>
              ) : null}
              <th>الطلب</th>
              <th>الأطراف</th>
              <th>القيمة</th>
              <th>الدفع</th>
              <th>التاريخ</th>
              {canDelete ? <th className="align-center">حذف</th> : null}
            </tr>
          </thead>
          <tbody>
            {operations.map((operation) => {
              const cod = operation.paymentMethod === "COD";
              return (
                <tr key={operation.id}>
                  {canDelete ? (
                    <td className="align-center">
                      <Checkbox
                        aria-label={`تحديد الطلب ${operation.orderId}`}
                        className={CHECKBOX_CLASS}
                        checked={selected.has(operation.id)}
                        onChange={() => onToggle(operation.id)}
                      />
                    </td>
                  ) : null}
                  <td dir="ltr">{operation.orderId || "—"}</td>
                  <td>
                    {cod
                      ? `${operation.courierName || "مندوب"} ← ${operation.merchantName || "تاجر"}`
                      : `كانجو ← ${operation.merchantName || "تاجر"}`}
                  </td>
                  <td dir="ltr">
                    {operationMoney(netCollected(operation), operation.currency)}
                  </td>
                  <td>{operationMethodLabel(operation.paymentMethod)}</td>
                  <td>{operationDate(operation.occurredAt)}</td>
                  {canDelete ? (
                    <td className="align-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deleting}
                        onClick={() => onDelete([operation.id])}
                      >
                        حذف
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
