"use client";

import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/form-inputs";
import {
  operationDate,
  operationMoney,
} from "@/lib/operations/format";
import {
  CLEARING_STATUS_LABEL,
  type ClearingLedgerRow,
  type ClearingParty,
} from "@/lib/operations/types";

import { useClearinghouse } from "./use-clearinghouse";

function PartyBook({
  parties,
  emptyLabel,
}: {
  parties: ClearingParty[];
  emptyLabel: string;
}) {
  if (parties.length === 0) return <p className="muted">{emptyLabel}</p>;

  return (
    <ul className="clearing-parties">
      {parties.map((party) => (
        <li key={`${party.entityType}:${party.partyId}`}>
          <div>
            <strong>{party.partyName}</strong>
            <span className="muted">
              {party.entityType === "merchant" ? "تاجر" : "مندوب"} ·{" "}
              {party.pendingCount} بند
            </span>
          </div>
          <strong
            className={
              party.balance > 0 ? "clearing-positive" : "clearing-negative"
            }
          >
            {operationMoney(Math.abs(party.balance), party.currency)}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function LedgerRows({
  rows,
  busyId,
  receiptUrl,
  setReceiptUrl,
  settle,
}: {
  rows: ClearingLedgerRow[];
  busyId: string;
  receiptUrl: Record<string, string>;
  setReceiptUrl: (update: (current: Record<string, string>) => Record<string, string>) => void;
  settle: (row: ClearingLedgerRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="muted">لا توجد بنود في هذه القائمة.</p>;
  }

  return (
    <ul className="clearing-rows">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="clearing-row-main">
            <strong>{row.orderId}</strong>
            <span>
              {row.partyName} · {row.entityType === "merchant" ? "تاجر" : "مندوب"}
            </span>
            <span className="muted">{operationDate(row.createdAt)}</span>
          </div>

          <div className="clearing-row-amount">
            <strong
              className={
                row.amount > 0 ? "clearing-positive" : "clearing-negative"
              }
            >
              {operationMoney(Math.abs(row.amount), row.currency)}
            </strong>
            <span className="badge badge-gold">
              {CLEARING_STATUS_LABEL[row.status] ?? "—"}
            </span>
          </div>

          {row.status === "pending" ? (
            <div className="clearing-row-actions">
              <TextField
                fieldClassName="clearing-receipt"
                placeholder="رابط إيصال السداد (اختياري)"
                value={receiptUrl[row.id] ?? ""}
                onChange={(event) =>
                  setReceiptUrl((current) => ({
                    ...current,
                    [row.id]: event.target.value,
                  }))
                }
              />
              <Button
                variant="primary"
                size="sm"
                disabled={busyId === row.id}
                onClick={() => settle(row)}
              >
                {row.amount > 0 ? "سداد" : "تحصيل"}
              </Button>
            </div>
          ) : (
            <span className="muted">سُوّي في {operationDate(row.clearedAt)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ClearinghouseBoard({
  initialRows,
  initialPayables,
  initialReceivables,
}: {
  initialRows: ClearingLedgerRow[];
  initialPayables: ClearingParty[];
  initialReceivables: ClearingParty[];
}) {
  const {
    rows,
    payables,
    receivables,
    status,
    pendingTotal,
    busyId,
    error,
    receiptUrl,
    setReceiptUrl,
    refresh,
    settle,
  } = useClearinghouse(initialRows, initialPayables, initialReceivables);

  const rowsProps = { rows, busyId, receiptUrl, setReceiptUrl, settle };

  return (
    <div className="clearinghouse">
      {error ? <p className="form-error">{error}</p> : null}

      <Tabs
        items={[
          {
            id: "book",
            label: "المستحقات",
            badge: pendingTotal,
            content: (
              <div className="clearing-book">
                <article className="panel">
                  <div className="panel-head">
                    <h2>مستحق لهم</h2>
                    <span className="muted">مبالغ على كانجو سدادها</span>
                  </div>
                  <PartyBook
                    parties={payables}
                    emptyLabel="لا توجد مبالغ مستحقة السداد."
                  />
                </article>

                <article className="panel">
                  <div className="panel-head">
                    <h2>مستحق لنا</h2>
                    <span className="muted">مبالغ على التجار والمناديب تحصيلها</span>
                  </div>
                  <PartyBook
                    parties={receivables}
                    emptyLabel="لا توجد مبالغ مستحقة التحصيل."
                  />
                </article>
              </div>
            ),
          },
          {
            id: "pending",
            label: status === "pending" ? "بنود قيد التسوية" : "بنود مُسوّاة",
            content: <LedgerRows {...rowsProps} />,
          },
        ]}
      />

      <div className="clearing-toggle">
        <Button
          variant={status === "pending" ? "primary" : "quiet"}
          size="sm"
          onClick={() => void refresh("pending")}
        >
          قيد التسوية
        </Button>
        <Button
          variant={status === "cleared" ? "primary" : "quiet"}
          size="sm"
          onClick={() => void refresh("cleared")}
        >
          مُسوّى
        </Button>
      </div>
    </div>
  );
}
