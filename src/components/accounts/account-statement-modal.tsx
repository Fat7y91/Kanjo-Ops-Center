"use client";

import { useMemo } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import type { AccountSummary } from "@/lib/accounts/ledger";
import { buildStatement } from "@/lib/accounts/statement";
import { downloadStatement } from "@/lib/accounts/statement-export";
import type { LedgerEntry } from "@/lib/accounts/types";

type AccountStatementModalProps = {
  open: boolean;
  summary: AccountSummary | null;
  entries: LedgerEntry[];
  onClose: () => void;
  /** Opens the voucher for a row when the viewer may read the journal. */
  onOpenEntry?: (entryId: string) => void;
};

/**
 * Printable bank statement for one treasury account.
 *
 * The layout follows a real bank statement: opening balance, every movement
 * with its source/destination, then a closing balance that reconciles by
 * construction. Export writes the same shaped rows to an Excel workbook; Print
 * uses the browser dialog against the print stylesheet, so the operator can
 * send the page straight to a printer or PDF.
 */
export function AccountStatementModal({
  open,
  summary,
  entries,
  onClose,
  onOpenEntry,
}: AccountStatementModalProps) {
  const statement = useMemo(
    () => (summary ? buildStatement(summary, entries) : null),
    [summary, entries],
  );

  const money = (value: number) =>
    statement ? currencyMoney(value, statement.currency) : "—";

  return (
    <Modal
      open={open}
      title="كشف حساب بنكي"
      eyebrow={statement ? statement.accountName : "الخزينة"}
      onClose={onClose}
      wide
    >
      {statement ? (
        <div className="bank-statement" dir="rtl">
          <header className="bank-statement-head">
            <div>
              <h4>{statement.accountName}</h4>
              <p className="muted" dir="ltr">
                {statement.accountNumber} · {statement.currency}
              </p>
            </div>
            <dl className="bank-statement-summary">
              <div>
                <dt>الرصيد الافتتاحي</dt>
                <dd dir="ltr">{money(statement.opening)}</dd>
              </div>
              <div>
                <dt>إجمالي الوارد</dt>
                <dd dir="ltr">{money(statement.totalIn)}</dd>
              </div>
              <div>
                <dt>إجمالي الصادر</dt>
                <dd dir="ltr">{money(statement.totalOut)}</dd>
              </div>
              <div>
                <dt>الرصيد الختامي</dt>
                <dd dir="ltr">{money(statement.closing)}</dd>
              </div>
            </dl>
          </header>

          {statement.lines.length === 0 ? (
            <p className="muted">لا توجد حركات مسجّلة على هذا الحساب.</p>
          ) : (
            <div className="bank-statement-scroll">
              <table className="bank-statement-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>البيان</th>
                    <th>المصدر / الوجهة</th>
                    <th>وارد</th>
                    <th>صادر</th>
                    <th>الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((line) => {
                    const clickable = Boolean(onOpenEntry);
                    return (
                      <tr
                        key={line.id}
                        className={clickable ? "statement-row-clickable" : undefined}
                        onClick={
                          onOpenEntry
                            ? () => onOpenEntry(line.entryId)
                            : undefined
                        }
                        onKeyDown={
                          onOpenEntry
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onOpenEntry(line.entryId);
                                }
                              }
                            : undefined
                        }
                        tabIndex={clickable ? 0 : undefined}
                        role={clickable ? "button" : undefined}
                        aria-label={
                          clickable
                            ? `عرض تفاصيل حركة ${line.reference}`
                            : undefined
                        }
                      >
                        <td className="bank-statement-date">
                          {shortDate(line.date)}
                        </td>
                        <td>{line.reference}</td>
                        <td>{line.counterparty || "—"}</td>
                        <td dir="ltr" className="bank-statement-in">
                          {line.in > 0 ? money(line.in) : "—"}
                        </td>
                        <td dir="ltr" className="bank-statement-out">
                          {line.out > 0 ? money(line.out) : "—"}
                        </td>
                        <td dir="ltr">{money(line.running)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>الرصيد الختامي</td>
                    <td dir="ltr">{money(statement.totalIn)}</td>
                    <td dir="ltr">{money(statement.totalOut)}</td>
                    <td dir="ltr">{money(statement.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="bank-statement-actions">
            <Button
              size="sm"
              variant="primary"
              onClick={() => downloadStatement(statement)}
            >
              تصدير إلى Excel
            </Button>
            <Button size="sm" variant="quiet" onClick={() => window.print()}>
              طباعة
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
