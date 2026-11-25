"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { cairoDateTime, currencyMoney, shortDate } from "@/lib/accounts/format";
import {
  statementArabicDate,
  statementLineParts,
  statementOrderCountLabel,
  statementPrintStamp,
} from "@/lib/operations/format";
import { statementTotals } from "@/lib/operations/statement-metrics";
import type { PartyStatement } from "@/lib/operations/types";

import { StatementSummary } from "./statement-summary";
import { useStatementExcel } from "./use-statement-excel";

type PartyStatementModalProps = {
  open: boolean;
  loading: boolean;
  error: string;
  statement: PartyStatement | null;
  onClose: () => void;
  onRetry: () => void;
  /** Opens the voucher for a statement line when the viewer may read it. */
  onOpenEntry?: (entryId: string) => void;
  canAdjust?: boolean;
  onAdjust?: () => void;
};

const BRAND = "كانچو للتوصيل والتجارة الإلكترونية";

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
  canAdjust = false,
  onAdjust,
}: PartyStatementModalProps) {
  const excel = useStatementExcel();
  const currency = statement?.currency ?? "EGP";
  const money = (value: number) => currencyMoney(value, currency);
  const totals = statementTotals(statement?.lines ?? []);
  const firstDate = statement?.lines[0]?.date;
  const lastDate = statement?.lines.at(-1)?.date;
  const balance = statement?.balance ?? 0;
  const period = statement?.period;
  const periodText =
    period?.from || period?.to
      ? `${statementArabicDate(period.from ?? undefined)} ← ${statementArabicDate(period.to ?? undefined)}`
      : `${statementArabicDate(firstDate)} ← ${statementArabicDate(lastDate)}`;

  return (
    <Modal
      open={open}
      title="كشف حساب"
      onClose={onClose}
      wide
      hideHeader
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
        <div className="statement statement-sheet" dir="rtl">
          <header className="statement-brand">
            <div className="statement-brand-id">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="statement-logo" />
              <p className="statement-company">{BRAND}</p>
            </div>
            <div className="statement-brand-title">
              <strong>
                {statement.partyType === "merchant"
                  ? "كشف حساب تاجر"
                  : "كشف حساب مندوب توصيل"}
              </strong>
              <span>طُبع: {statementPrintStamp()}</span>
            </div>
          </header>

          <div className="statement-meta">
            <div className="statement-meta-item">
              <span className="statement-meta-label">اسم الجهة:</span>
              <strong>{statement.partyName}</strong>
            </div>
            <div className="statement-meta-item">
              <span className="statement-meta-label">نوع الشريك:</span>
              <strong>
                {statement.partyType === "merchant" ? "تاجر" : "مندوب توصيل"}
              </strong>
            </div>
            <div className="statement-meta-item">
              <span className="statement-meta-label">العملة:</span>
              <strong>{currency}</strong>
            </div>
            {statement.partyType === "courier" ? (
              <div className="statement-meta-item">
                <span className="statement-meta-label">أيام العمل:</span>
                <strong>{statement.workingDays ?? 0} أيام</strong>
              </div>
            ) : null}
            <div className="statement-meta-item">
              <span className="statement-meta-label">عدد الطلبات:</span>
              <strong>{statementOrderCountLabel(statement.orderCount)}</strong>
            </div>
            <div className="statement-meta-period">
              <span className="statement-meta-label">الفترة:</span>
              <span className="statement-date" dir="rtl">
                {periodText}
              </span>
            </div>
          </div>

          {canAdjust && onAdjust ? (
            <div className="statement-toolbar">
              <Button variant="accent" size="sm" onClick={onAdjust}>
                + إضافة مكافأة / تسوية
              </Button>
            </div>
          ) : null}

          <StatementSummary statement={statement} />

          {statement.lines.length === 0 ? (
            <p className="muted">لا توجد حركات على هذا الحساب بعد.</p>
          ) : (
            <table className="breakdown-journal statement-table">
              <thead>
                <tr>
                  <th>التاريخ والوقت</th>
                  <th>المرجع</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line) => {
                  const parts = statementLineParts(line, currency);
                  return (
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
                      <td className="statement-when">
                        {line.occurredAt
                          ? cairoDateTime(line.occurredAt)
                          : shortDate(line.date)}
                      </td>
                      <td>
                        <span
                          className="statement-desc"
                          title={`${line.reference}${line.memo ? ` — ${line.memo}` : ""}`}
                        >
                          {parts.lead}
                          {parts.courierName ? (
                            <>
                              {" · "}
                              <span className="statement-courier">
                                المندوب: {parts.courierName}
                              </span>
                            </>
                          ) : null}
                          {parts.tail}
                        </span>
                      </td>
                      <td dir="ltr">{line.debit > 0 ? money(line.debit) : "—"}</td>
                      <td dir="ltr">{line.credit > 0 ? money(line.credit) : "—"}</td>
                      <td dir="ltr">{money(line.running)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="statement-total-label">الإجمالي</td>
                  <td />
                  <td dir="ltr">{money(totals.debit)}</td>
                  <td dir="ltr">{money(totals.credit)}</td>
                  <td dir="ltr">{money(balance)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          <footer className="statement-signoff">
            <div>
              <span>توقيع المستلم (المندوب / التاجر)</span>
              <i />
            </div>
            <div>
              <span>توقيع المحاسب / الختم</span>
              <i />
              <small>التاريخ: ____ / ____ / 2026</small>
            </div>
          </footer>

          {excel.error ? <p className="form-error">{excel.error}</p> : null}

          <div className="breakdown-foot statement-actions">
            <Button
              variant="accent"
              size="sm"
              disabled={excel.busy}
              onClick={() => void excel.exportStatement(statement)}
            >
              {excel.busy ? "جارٍ التصدير…" : "تصدير Excel"}
            </Button>
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
