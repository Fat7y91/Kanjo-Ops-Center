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
  /** Opens the voucher for a statement line when the viewer may read it. */
  onOpenEntry?: (entryId: string) => void;
};

const BRAND = "كانجو للتوصيل والتجارة الإلكترونية";

function closingLabel(type: PartyStatement["partyType"], balance: number) {
  if (Math.abs(balance) < 0.005) return "مطابق";
  if (type === "courier") {
    return balance > 0 ? "مستحق لكانجو" : "مستحق للمندوب";
  }
  return balance > 0 ? "مستحق لكانجو" : "مستحق للتاجر";
}

function printStamp(): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
    }).format(new Date());
  } catch {
    return "";
  }
}

/**
 * Printable A4 statement of account for a merchant or courier.
 *
 * Every journal line that moved the party's balance is listed with its date,
 * reference and amount, and a running balance down the side. The closing row is
 * the account's live balance, so the statement reconciles against the book by
 * construction. The print stylesheet hides the surrounding app and shows only
 * `.statement-sheet`, so the browser's "print / save PDF" produces the page.
 */
export function PartyStatementModal({
  open,
  loading,
  error,
  statement,
  onClose,
  onRetry,
  onOpenEntry,
}: PartyStatementModalProps) {
  const currency = statement?.currency ?? "EGP";
  const money = (value: number) => currencyMoney(value, currency);
  const totalDebit =
    statement?.lines.reduce((sum, line) => sum + line.debit, 0) ?? 0;
  const totalCredit =
    statement?.lines.reduce((sum, line) => sum + line.credit, 0) ?? 0;
  const firstDate = statement?.lines[0]?.date;
  const lastDate = statement?.lines.at(-1)?.date;
  const balance = statement?.balance ?? 0;

  return (
    <Modal open={open} title="كشف حساب" eyebrow={statement?.partyName ?? "الطرف"} onClose={onClose} wide>
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
        <div className="statement statement-sheet" dir="rtl">
          <header className="statement-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="statement-logo" />
            <div>
              <p className="statement-company">{BRAND}</p>
              <h3>كشف حساب طرف</h3>
            </div>
            <span className="statement-stamp">{printStamp()}</span>
          </header>

          <div className="statement-meta">
            <div>
              <span className="statement-meta-label">الطرف</span>
              <strong>{statement.partyName}</strong>
              <span
                className={
                  statement.partyType === "merchant"
                    ? "badge badge-blue"
                    : "badge badge-orange"
                }
              >
                {statement.partyType === "merchant" ? "تاجر" : "مندوب توصيل"}
              </span>
            </div>
            <div>
              <span className="statement-meta-label">الفترة</span>
              <strong dir="ltr">
                {firstDate ? shortDate(firstDate) : "—"} ←{" "}
                {lastDate ? shortDate(lastDate) : "—"}
              </strong>
            </div>
            <div>
              <span className="statement-meta-label">العملة</span>
              <strong>{currency}</strong>
            </div>
            {statement.partyType === "courier" ? (
              <div>
                <span className="statement-meta-label">أيام العمل</span>
                <strong dir="ltr">{statement.workingDays ?? 0}</strong>
              </div>
            ) : null}
          </div>

          <div className="statement-summary">
            <div>
              <span>إجمالي المدين</span>
              <strong dir="ltr">{money(totalDebit)}</strong>
            </div>
            <div>
              <span>إجمالي الدائن</span>
              <strong dir="ltr">{money(totalCredit)}</strong>
            </div>
            <div className="statement-summary-closing">
              <span>الرصيد الختامي · {closingLabel(statement.partyType, balance)}</span>
              <strong dir="ltr">{money(Math.abs(balance))}</strong>
            </div>
          </div>

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
                  <tr
                    key={line.id}
                    className={onOpenEntry ? "statement-row-clickable" : undefined}
                    onClick={onOpenEntry ? () => onOpenEntry(line.entryId) : undefined}
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
                    tabIndex={onOpenEntry ? 0 : undefined}
                    role={onOpenEntry ? "button" : undefined}
                    aria-label={
                      onOpenEntry ? `عرض تفاصيل حركة ${line.reference}` : undefined
                    }
                  >
                    <td>{shortDate(line.date)}</td>
                    <td>
                      {line.reference}
                      {line.memo ? (
                        <em className="breakdown-journal-memo">{line.memo}</em>
                      ) : null}
                    </td>
                    <td dir="ltr">{line.debit > 0 ? money(line.debit) : "—"}</td>
                    <td dir="ltr">{line.credit > 0 ? money(line.credit) : "—"}</td>
                    <td dir="ltr">{money(line.running)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>الإجمالي</td>
                  <td dir="ltr">{money(totalDebit)}</td>
                  <td dir="ltr">{money(totalCredit)}</td>
                  <td dir="ltr">{money(balance)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          <footer className="statement-signoff">
            <div>
              <span>الأسبوع الأول</span>
              <i />
            </div>
            <div>
              <span>الأسبوع الثاني</span>
              <i />
            </div>
            <div>
              <span>الأسبوع الثالث</span>
              <i />
            </div>
            <div>
              <span>الأسبوع الرابع</span>
              <i />
            </div>
            <p>توقيع المسؤول / الختم</p>
          </footer>

          <div className="breakdown-foot statement-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.print()}
            >
              طباعة / حفظ PDF
            </Button>
            <Button variant="quiet" size="sm" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
