"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/field-ops/format";
import type { ArchivedReport } from "@/lib/archived-reports/types";

type ArchivedReportsViewProps = {
  initialReports: ArchivedReport[];
  canManage: boolean;
  unavailable: boolean;
};

function reportSummary(report: Record<string, unknown>): string {
  const outcome = report["outcome"];
  const notes = report["notes"];
  if (typeof notes === "string" && notes.trim()) return notes;
  if (typeof outcome === "string" && outcome.trim()) return outcome;
  return "تقرير زيارة";
}

/**
 * Archived-report browser with restore.
 *
 * Restore deletes the archive row (the live report was never destroyed), so
 * after a successful response the row is removed from this list only.
 */
export function ArchivedReportsView({
  initialReports,
  canManage,
  unavailable,
}: ArchivedReportsViewProps) {
  const [reports, setReports] = useState<ArchivedReport[]>(initialReports);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function restore(id: string) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/archived-reports/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? "تعذر استعادة التقرير.");
        return;
      }
      setReports((current) => current.filter((item) => item.id !== id));
      setNotice("تمت استعادة التقرير إلى مسار المهمة.");
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusyId(null);
    }
  }

  if (unavailable) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>الأرشيف غير مفعّل</h2>
        </div>
        <p className="muted">
          لم يُطبَّق ترحيل التقارير المؤرشفة على هذه البيئة بعد.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>التقارير المؤرشفة</h2>
        <span className="muted">{reports.length} تقرير</span>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>المهمة</th>
              <th>التاجر</th>
              <th>الملخص</th>
              <th>السبب</th>
              <th>أرشفه</th>
              <th>التاريخ</th>
              {canManage ? <th className="align-right">إجراء</th> : null}
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>{report.taskName || report.taskId || "—"}</td>
                <td>{report.merchantId}</td>
                <td>{reportSummary(report.report)}</td>
                <td>{report.reason}</td>
                <td>{report.archivedByName || "—"}</td>
                <td>{formatDateTime(report.occurredAt)}</td>
                {canManage ? (
                  <td>
                    <div className="row-actions">
                      <Button
                        size="sm"
                        variant="quiet"
                        disabled={busyId === report.id}
                        onClick={() => restore(report.id)}
                      >
                        {busyId === report.id ? "جارٍ…" : "استعادة"}
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}

            {reports.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6}>
                  <p className="empty-state">لا توجد تقارير مؤرشفة.</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
