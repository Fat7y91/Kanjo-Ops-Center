"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import type {
  PartyStatement,
  PartyStatementLine,
} from "@/lib/operations/types";

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

function compactNumber(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(2).replace(/\.?0+$/, "");
}

/** A single-line description so a weekly statement stays on one A4 page. */
function describeLine(line: PartyStatementLine): string {
  if (
    line.memo.includes("الحضور اليومي") ||
    line.reference.startsWith("حضور يومي")
  ) {
    return `حضور يومي (${line.date})`;
  }

  if (line.memo.includes("صافي الطلب")) {
    const numbers = line.memo.match(/\d+(?:\.\d+)?/g) ?? [];
    if (numbers.length >= 3) {
      const [value = "0", collected = "0", cut = "0"] = numbers;
      const order = /(\d{4,})/.exec(line.reference)?.[1];
      const head = order ? `طلب #${order}` : line.reference;
      return `${head} (قيمة ${compactNumber(value)} · محصّل ${compactNumber(
        collected,
      )} · أجر ${compactNumber(cut)})`;
    }
  }

  return line.memo.replace(/^صافي الطلب:\s*/, "") || line.reference;
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

function arabicDate(value?: string): string {
  if (!value) return "—";
  const parsed = new Date(
    value.length === 10 ? `${value}T12:00:00Z` : value,
  );
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
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
              <span>طُبع: {printStamp()}</span>
            </div>
          </header>

          <div className="statement-meta">
            <div className="statement-meta-item">
              <span className="statement-meta-label">الطرف:</span>
              <strong>{statement.partyName}</strong>
            </div>
            <div className="statement-meta-item">
              <span className="statement-meta-label">النوع:</span>
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
            <div className="statement-meta-period">
              <span className="statement-meta-label">الفترة:</span>
              <span>
                من{" "}
                <span className="statement-date" dir="rtl">
                  {arabicDate(firstDate)}
                </span>{" "}
                إلى{" "}
                <span className="statement-date" dir="rtl">
                  {arabicDate(lastDate)}
                </span>
              </span>
            </div>
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
            <div>
              <span>
                {statement.partyType === "courier" ? "أيام العمل" : "عدد الحركات"}
              </span>
              <strong dir="ltr">
                {statement.partyType === "courier"
                  ? statement.workingDays ?? 0
                  : statement.lines.length}
              </strong>
            </div>
            <div className="statement-summary-closing">
              <span>
                الرصيد الختامي · {closingLabel(statement.partyType, balance)}
              </span>
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
                      <span
                        className="statement-desc"
                        title={`${line.reference}${line.memo ? ` — ${line.memo}` : ""}`}
                      >
                        {describeLine(line)}
                      </span>
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
              <span>توقيع المستلم (المندوب / التاجر)</span>
              <i />
            </div>
            <div>
              <span>توقيع المحاسب / الختم</span>
              <i />
              <small>التاريخ: ____ / ____ / 2026</small>
            </div>
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
