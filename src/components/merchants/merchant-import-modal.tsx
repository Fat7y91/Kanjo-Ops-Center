"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { matchKey } from "@/lib/import/csv";
import {
  planMerchantImport,
  type MerchantImportRoster,
} from "@/lib/merchants/import";

type VendorTypeOption = { id: number; name_ar: string; name_en?: string };
type CityOption = { id: string; name: string };

/**
 * Bulk merchants CSV import.
 *
 * The browser previews the file with the same pure mapper the server uses, so
 * the operator sees exactly which rows will be created and why the rest are
 * skipped. The server re-validates against the live catalogue and city list
 * before writing.
 */
export function MerchantImportModal({
  open,
  cities,
  vendorTypes,
  defaultCityId,
  onClose,
  onImported,
}: {
  open: boolean;
  cities: CityOption[];
  vendorTypes: VendorTypeOption[];
  defaultCityId?: string;
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

  const roster = useMemo<MerchantImportRoster>(() => {
    const vendorMap = new Map<string, { id: number; name: string }>();
    for (const vendor of vendorTypes) {
      vendorMap.set(matchKey(vendor.name_ar), { id: vendor.id, name: vendor.name_ar });
      if (vendor.name_en) {
        vendorMap.set(matchKey(vendor.name_en), { id: vendor.id, name: vendor.name_ar });
      }
    }
    const cityMap = new Map<string, string>();
    for (const city of cities) {
      cityMap.set(matchKey(city.name), city.id);
    }
    return {
      vendorTypes: vendorMap,
      cities: cityMap,
      defaultCityId: defaultCityId ?? cities[0]?.id ?? "",
    };
  }, [cities, vendorTypes, defaultCityId]);

  const plan = useMemo(() => planMerchantImport(rows, roster), [rows, roster]);

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
      const response = await fetch("/api/merchants/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, defaultCityId: roster.defaultCityId }),
      });
      const payload = (await response.json()) as {
        imported?: number;
        skipped?: { line: number; message: string }[];
        error?: string;
      };
      if (!response.ok || typeof payload.imported !== "number") {
        setError(payload.error ?? "تعذر استيراد التجار.");
        return;
      }
      setSummary({
        imported: payload.imported,
        skipped: payload.skipped ?? [],
      });
      onImported(`تم استيراد ${payload.imported} تاجر.`);
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
      eyebrow="استيراد التجار"
      title="رفع ملف تجار (CSV)"
      description="الأعمدة المقروءة: الاسم، الهاتف، نوع التاجر، نسبة العمولة، العنوان، والمدينة اختيارياً. تُرفض الصفوف غير المطابقة لأنواع التجار المسجلة."
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      wide
    >
      <div className="form-stack">
        <label className="field">
          <span>ملف التجار (CSV)</span>
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
            <span>تم استيراد {summary.imported} تاجر.</span>
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
            {busy ? "جارٍ الاستيراد…" : "استيراد التجار"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
