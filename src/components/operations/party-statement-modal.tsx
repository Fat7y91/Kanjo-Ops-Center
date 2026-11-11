"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import type { PartyStatement } from "@/lib/operations/types";

type PartyStatementModalProps = {
  open: boolean;
  loading: boolean;
  error: string;
  statement: PartyStatement | null;
  onClose: () => void;
  onRetry: () => void;
};

/**
 * Printable statement of account for a merchant or courier.
 *
 * Every journal line that moved the party's balance is listed with its date,
 * reference and amount, and a running balance down the side. The closing row is
 * the account's live balance, so the statement reconciles against the book by
 * construction.
 */
export function PartyStatementModal({
  open,
  loading,
  error,
  statement,
  onClose,
  onRetry,
}: PartyStatementModalProps) {
  const currency = statement?.currency ?? "EGP";
  const money = (value: number) => currencyMoney(value, currency);

  return (
    <Modal
      open={open}
      title="كشف حساب"
      eyebrow={statement ? statement.partyName : "الطرف"}
      onClose={onClose}
      wide
    >
      {loading ? <p className="muted">جارٍ تحميل كشف الحساب…</p> : null}

      {!loading && error ? (
        <div className="breakdown-error" role="alert">
          <p className="form-error">{error}</p>
          <div className="form-actions">
            <Button variant="primary" size="sm" onClick={onRetry}>
              إعادة المحاولة
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && !error && statement ? (
        <div className="statement" dir="rtl">
          <header className="breakdown-head">
            <div>
              <span className="badge badge-gold">
                {statement.partyType === "merchant" ? "تاجر" : "مندوب"}
              </span>
              <h4>{statement.partyName}</h4>
              <p className="muted">
                {statement.lines.length} حركة · {currency}
              </p>
            </div>
            <div className="breakdown-head-total">
              <span>الرصيد الحالي</span>
              <strong dir="ltr">{money(statement.balance)}</strong>
            </div>
          </header>

          {statement.lines.length === 0 ? (
            <p className="muted">لا توجد حركات على هذا الحساب بعد.</p>
          ) : (
            <table className="breakdown-journal statement-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>المرجع</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{shortDate(line.date)}</td>
                    <td>
                      {line.reference}
                      {line.memo ? (
                        <em className="breakdown-journal-memo">{line.memo}</em>
                      ) : null}
                    </td>
                    <td dir="ltr">{line.debit > 0 ? money(line.debit) : "—"}</td>
                    <td dir="ltr">
                      {line.credit > 0 ? money(line.credit) : "—"}
                    </td>
                    <td dir="ltr">{money(line.running)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>الرصيد الختامي</td>
                  <td dir="ltr">{money(statement.balance)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          <div className="breakdown-foot">
            <Button variant="quiet" size="sm" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
