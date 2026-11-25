"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { currencyMoney } from "@/lib/accounts/format";
import { clearingReportFileBase } from "@/lib/exports/file-names";
import { printWithDocumentTitle } from "@/lib/exports/print-document";
import {
  clearingReportTotals,
  type ClearingReport,
} from "@/lib/operations/clearing-report";
import { statementPrintStamp } from "@/lib/operations/format";

type ClearingReportModalProps = {
  open: boolean;
  loading: boolean;
  error: string;
  report: ClearingReport | null;
  onClose: () => void;
  onRetry: () => void;
};

const BRAND = "كانچو للتوصيل والتجارة الإلكترونية";

export function ClearingReportModal({
  open,
  loading,
  error,
  report,
  onClose,
  onRetry,
}: ClearingReportModalProps) {
  const money = (value: number) =>
    report ? currencyMoney(value, report.currency) : "";
  // Recompute from the rows actually shown so the KPIs, footer and export agree.
  const totals = report ? clearingReportTotals(report.rows) : null;
  const printTitle = report
    ? clearingReportFileBase(report.kind)
    : "تقرير إجمالي";

  return (
    <Modal open={open} title="تقرير إجمالي" onClose={onClose} wide hideHeader>
      {loading ? <p className="muted">جارٍ تجهيز التقرير…</p> : null}

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

      {!loading && !error && report && totals ? (
        <div className="clearing-report-sheet" dir="rtl">
          <header className="clearing-report-masthead">
            <div className="clearing-report-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="clearing-report-logo" />
              <div>
                <p className="clearing-report-company">{BRAND}</p>
                <h2>{report.title}</h2>
              </div>
            </div>
            <div className="clearing-report-stamp">
              <span>تاريخ الطباعة</span>
              <strong>{statementPrintStamp()}</strong>
              <span>الفترة</span>
              <strong>{report.periodLabel}</strong>
            </div>
          </header>

          <div className="clearing-report-kpis">
            <div>
              <span>إجمالي المدين</span>
              <strong dir="ltr">{money(totals.debit)}</strong>
            </div>
            <div>
              <span>إجمالي الدائن</span>
              <strong dir="ltr">{money(totals.credit)}</strong>
            </div>
            <div>
              <span>عدد الطلبات</span>
              <strong>{totals.orders} طلب</strong>
            </div>
            <div>
              <span>أيام العمل</span>
              <strong>{totals.workingDays}</strong>
            </div>
            <div className="clearing-report-kpi-total">
              <span>صافي الرصيد</span>
              <strong dir="ltr">{money(totals.net)}</strong>
            </div>
          </div>

          <table className="clearing-report-table">
            <thead>
              <tr>
                <th>الطرف</th>
                <th>النوع</th>
                <th>عدد الطلبات</th>
                <th>أيام العمل</th>
                <th>إجمالي المدين</th>
                <th>إجمالي الدائن</th>
                <th>صافي الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.accountId}>
                  <td className="clearing-report-party">{row.partyName}</td>
                  <td>{row.partyType === "merchant" ? "تاجر" : "مندوب"}</td>
                  <td dir="ltr">{row.orderCount}</td>
                  <td dir="ltr">{row.workingDays ?? "—"}</td>
                  <td dir="ltr">{money(row.debit)}</td>
                  <td dir="ltr">{money(row.credit)}</td>
                  <td dir="ltr" className="clearing-report-net">
                    {money(Math.abs(row.net))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>الإجمالي</td>
                <td dir="ltr">{totals.orders}</td>
                <td dir="ltr">{totals.workingDays}</td>
                <td dir="ltr">{money(totals.debit)}</td>
                <td dir="ltr">{money(totals.credit)}</td>
                <td dir="ltr">{money(totals.net)}</td>
              </tr>
            </tfoot>
          </table>

          <footer className="clearing-report-signoff">
            <div>
              <span>مدير المنطقة</span>
              <i />
              <small>الاسم والتوقيع</small>
            </div>
            <div>
              <span>المحاسب / الإدارة المالية</span>
              <i />
              <small>الاسم والتوقيع والختم</small>
            </div>
          </footer>

          <div className="breakdown-foot clearing-report-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => printWithDocumentTitle(printTitle)}
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
