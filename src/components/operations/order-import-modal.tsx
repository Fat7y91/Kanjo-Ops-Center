"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import {
  matchKey,
  planImport,
  type ImportRoster,
} from "@/lib/operations/orders-import";
import type { CourierOption, MerchantOption } from "@/lib/operations/types";

/**
 * Bulk orders CSV import.
 *
 * The browser parses and previews the file with the same pure mapper the server
 * uses, so the operator sees exactly which rows will post and which will be
 * skipped before anything is written. Nothing here decides money: the server
 * re-validates against the live roster and the posting triggers freeze the
 * financial terms.
 */
export function OrderImportModal({
  open,
  merchants,
  couriers,
  onClose,
  onImported,
}: {
  open: boolean;
  merchants: MerchantOption[];
  couriers: CourierOption[];
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<{
    imported: number;
    skipped: { line: number; message: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The roster is derived from the same options the logger already holds, so
  // the preview matches the parties the server can resolve by name.
  const roster = useMemo<ImportRoster>(() => {
    const merchantMap = new Map<string, string>();
    for (const merchant of merchants) {
      merchantMap.set(matchKey(merchant.name), merchant.id);
    }
    const courierMap = new Map<string, string>();
    for (const courier of couriers) {
      courierMap.set(matchKey(courier.displayName), courier.id);
    }
    return { merchants: merchantMap, couriers: courierMap };
  }, [merchants, couriers]);

  const plan = useMemo(() => planImport(rows, roster), [rows, roster]);

  async function choose(file: File | null) {
    if (!file) return;
    setError("");
    setSummary(null);
    try {
      const parsed = await new Promise<Record<string, unknown>[]>(
        (resolve, reject) => {
          Papa.parse<Record<string, unknown>>(file, {
            header: true,
            skipEmptyLines: "greedy",
            transformHeader: (header) => header.trim(),
            complete: (result) => resolve(result.data),
            error: (rejectError) => reject(rejectError),
          });
        },
      );
      setRows(parsed);
      setFileName(file.name);
    } catch {
      setError("تعذر قراءة ملف CSV.");
    }
  }

  async function submit() {
    if (plan.candidates.length === 0) {
      setError("لا توجد صفوف صالحة للاستيراد.");
      return;
    }
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const response = await fetch("/api/operations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const payload = (await response.json()) as {
        imported?: number;
        skipped?: { line: number; message: string }[];
        error?: string;
      };
      if (!response.ok || typeof payload.imported !== "number") {
        setError(payload.error ?? "تعذر استيراد الطلبات.");
        return;
      }
      setSummary({
        imported: payload.imported,
        skipped: payload.skipped ?? [],
      });
      onImported(`تم استيراد ${payload.imported} طلب.`);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setRows([]);
    setFileName("");
    setSummary(null);
    setError("");
  }

  return (
    <Modal
      open={open}
      eyebrow="استيراد الطلبات"
      title="رفع ملف طلبات (CSV)"
      description="الأعمدة المقروءة: رقم الطلب، التاجر، المندوب، طريقة الدفع، الإجمالي، أجر التوصيل، التاريخ. تُرفض الصفوف غير المطابقة للتجار والمناديب المسجلين."
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      wide
    >
      <div className="form-stack">
        <label className="field">
          <span>ملف الطلبات (CSV)</span>
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

        {rows.length > 0 ? (
          <div className="inline-note" role="status">
            <strong>معاينة</strong>
            <span>
              {plan.candidates.length} صف صالح ·{" "}
              {plan.issues.length + plan.duplicates.length} صف مستبعد
            </span>
          </div>
        ) : null}

        {plan.issues.length + plan.duplicates.length > 0 ? (
          <ul className="coupon-import-issues">
            {[...plan.duplicates, ...plan.issues].slice(0, 50).map((issue, index) => (
              <li key={`${issue.line}-${index}`}>
                سطر {issue.line}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {summary ? (
          <div className="inline-note" role="status">
            <strong>اكتمل الاستيراد</strong>
            <span>تم استيراد {summary.imported} طلب.</span>
            {summary.skipped.length > 0 ? (
              <>
                <span>{summary.skipped.length} صفاً لم يُستورد:</span>
                <ul className="coupon-import-issues">
                  {summary.skipped.slice(0, 50).map((issue, index) => (
                    <li key={`${issue.line}-${index}`}>
                      سطر {issue.line}: {issue.message}
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
            onClick={submit}
            disabled={busy || plan.candidates.length === 0}
          >
            {busy ? "جارٍ الاستيراد…" : "استيراد الطلبات"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
