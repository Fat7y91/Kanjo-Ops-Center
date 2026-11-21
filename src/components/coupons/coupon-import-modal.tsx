"use client";

import { useState } from "react";
import Papa from "papaparse";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import type { CouponImportSummary } from "@/lib/coupons/csv";

/**
 * Coupon CSV bulk import.
 *
 * The approved export has exactly 20 columns. Parsing happens in the browser so
 * a large file never streams through the API; the server re-parses the same
 * rows with the same pure functions before writing, so a tampered payload
 * cannot skip the unit conversion or the funding rules.
 */
const EXPECTED_COLUMNS = [
  "coupon_code",
  "coupon_type",
  "active",
  "discount_funded_by",
  "vendor_funding_percent",
  "stackable",
  "stack_priority",
  "uses_count",
  "discount_amount",
  "shipping_discount",
  "cashback_amount",
  "total_impact",
  "vendor_funded_amount",
  "platform_funded_amount",
  "budget_applied_amount",
  "budget_cap",
  "budget_used",
  "budget_remaining",
  "last_used_at",
  "created_at",
] as const;

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

export function CouponImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: (message: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [summary, setSummary] = useState<CouponImportSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const missingColumns = EXPECTED_COLUMNS.filter(
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
      const response = await fetch("/api/coupons/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const payload = (await response.json()) as {
        summary?: CouponImportSummary;
        error?: string;
      };
      if (!response.ok || !payload.summary) {
        setError(payload.error ?? "تعذر استيراد الكوبونات.");
        return;
      }
      setSummary(payload.summary);
      onImported?.(
        `تم استيراد ${payload.summary.written} كوبون من أصل ${payload.summary.parsed}.`,
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

  const canImport = rows.length > 0 && !busy;

  return (
    <Modal
      open={open}
      eyebrow="استيراد الكوبونات"
      title="رفع ملف CSV"
      description="الملف يُطابق تصدير لوحة الكوبونات بنفس الأعمدة العشرين. تُحدَّث الأكواد المكررة بدل إنشاء نسخ جديدة."
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      wide
    >
      <div className="form-stack">
        <label className="field">
          <span>ملف الكوبونات (CSV)</span>
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
            تنبيه: أعمدة مفقودة عن الصيغة المعتمدة:{" "}
            <span dir="ltr">{missingColumns.join(", ")}</span>. ستُستورد الصفوف
            بالقيم الافتراضية للأعمدة الناقصة.
          </div>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {summary ? (
          <div className="coupon-import-note inline-note" role="status">
            <strong>اكتمل الاستيراد</strong>
            <span>
              تم استيراد {summary.written} كوبون من أصل {summary.parsed} صف
              {summary.duplicates > 0
                ? `، و${summary.duplicates} كود مكرر داخل الملف دُمج`
                : ""}
              .
            </span>
            {summary.issues.length > 0 ? (
              <>
                <span>{summary.issues.length} صفاً لم يُستورد:</span>
                <ul className="coupon-import-issues">
                  {summary.issues.slice(0, 50).map((issue, index) => (
                    <li key={`${issue.line}-${index}`}>
                      سطر {issue.line}: {issue.message}
                      {issue.code ? ` (${issue.code})` : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="form-actions">
          <Button variant="quiet" onClick={reset} disabled={busy}>
            تصفير
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!canImport}
          >
            {busy ? "جارٍ الاستيراد…" : "بدء الاستيراد"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
