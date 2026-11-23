"use client";

import Papa from "papaparse";
import { useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import {
  COUPON_USAGE_REPORT_COLUMNS,
  type CouponUsageReportImportSummary,
} from "@/lib/coupons/usage-report";

function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      complete: (result) => resolve(result.data),
      error: (error) => reject(error),
    });
  });
}

type CouponUsageImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: (message: string) => void;
};

/** Browser-side preview and upload for `coupon-usage-report-*.csv`. */
export function CouponUsageImportModal({
  open,
  onClose,
  onImported,
}: CouponUsageImportModalProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [summary, setSummary] = useState<CouponUsageReportImportSummary | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const missingColumns = COUPON_USAGE_REPORT_COLUMNS.filter(
    (column) => headers.length > 0 && !headers.includes(column),
  );

  async function choose(file: File | null) {
    if (!file) return;
    setError("");
    setSummary(null);
    try {
      const parsed = await parseCsv(file);
      setRows(parsed);
      setFileName(file.name);
      setHeaders(Object.keys(parsed[0] ?? {}));
    } catch {
      setError("تعذر قراءة ملف CSV.");
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const response = await fetch("/api/coupons/usage-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, fileName }),
      });
      const payload = (await response.json()) as {
        summary?: CouponUsageReportImportSummary;
        error?: string;
      };
      if (!response.ok || !payload.summary) {
        setError(payload.error ?? "تعذر استيراد تقرير الكوبونات.");
        return;
      }
      setSummary(payload.summary);
      onImported(
        `تم استيراد ${payload.summary.written} كود من أصل ${payload.summary.parsed}.`,
      );
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setRows([]);
    setFileName("");
    setHeaders([]);
    setSummary(null);
    setError("");
  }

  return (
    <Modal
      open={open}
      eyebrow="تقرير الكوبونات"
      title="استيراد تقرير استخدام الكوبونات"
      description="ارفع ملف coupon-usage-report-*.csv. يُحدَّث كل كود مُعاد استيراده، ويُحتفظ بباقي اللقطة كما هي."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="form-stack">
        <label className="field">
          <span>ملف تقرير الكوبونات (CSV)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void choose(file);
            }}
          />
          <span className="field-hint">
            {fileName ? `${fileName} · ${rows.length} صف` : "لم يُختر ملف بعد."}
          </span>
        </label>

        {missingColumns.length > 0 ? (
          <div className="inline-note">
            تنبيه: أعمدة مفقودة عن صيغة التقرير:{" "}
            <span dir="ltr">{missingColumns.join(", ")}</span>. ستُستورد الصفوف
            بالقيم الافتراضية للأعمدة الناقصة.
          </div>
        ) : null}

        <p className="form-hint">
          التقرير يشمل كل الطلبات التي طُبّق عليها الكود، بما فيها الملغاة وغير
          المسلّمة. أرقام الأرباح المالية تُحسب من الطلبات المسلّمة فقط.
        </p>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {summary ? (
          <div className="inline-note" role="status">
            <strong>اكتمل الاستيراد</strong>
            <span>
              تم حفظ {summary.written} كود من أصل {summary.parsed} صف
              {summary.duplicates > 0
                ? `، و${summary.duplicates} كود مكرر دُمج`
                : ""}
              .
            </span>
          </div>
        ) : null}

        <div className="form-actions">
          <Button variant="quiet" onClick={reset} disabled={busy}>
            تصفير
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={rows.length === 0 || busy}
          >
            {busy ? "جارٍ الاستيراد…" : "بدء الاستيراد"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
