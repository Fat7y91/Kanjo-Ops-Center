"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";

type SyncSummary = {
  vendorTypesParsed: number;
  categoriesParsed: number;
  duplicates: number;
  unresolvedParents: number;
  unknownVendors: number[];
  created: number;
  updated: number;
  issues: { file: string; line: number; message: string }[];
};

type FileKey = "vendorTypes" | "categories" | "variantAttributes";

type ParseState = Record<FileKey, Record<string, unknown>[]>;

const FILE_LABELS: Record<FileKey, string> = {
  vendorTypes: "vendor-types.csv",
  categories: "categories.csv",
  variantAttributes: "variant-attributes.csv",
};

const EMPTY: ParseState = {
  vendorTypes: [],
  categories: [],
  variantAttributes: [],
};

function parseFile(file: File): Promise<Record<string, unknown>[]> {
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

/**
 * V1 dashboard CSV import.
 *
 * Parsing happens in the browser so a large export never streams through the
 * API. Only the categories rows (and vendor types, for name resolution) are
 * sent to the server, which re-derives the deterministic uuids before writing.
 * Variant attributes are parsed here for a count only: the database has no
 * variant table yet, and silently dropping them would be dishonest, so they are
 * reported as parsed-but-not-persisted.
 */
export function TaxonomySyncModal({
  open,
  onClose,
  onSynced,
}: {
  open: boolean;
  onClose: () => void;
  onSynced?: (message: string) => void;
}) {
  const [files, setFiles] = useState<ParseState>(EMPTY);
  const [names, setNames] = useState<Partial<Record<FileKey, string>>>({});
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadedCount = useMemo(
    () =>
      [files.vendorTypes, files.categories, files.variantAttributes].filter(
        (rows) => rows.length > 0,
      ).length,
    [files],
  );

  const parsedCount = useMemo(
    () => files.vendorTypes.length + files.categories.length + files.variantAttributes.length,
    [files],
  );

  // Every file is independent: an operator may sync categories alone, vendor
  // types alone (names resolve against the seed for later category imports), or
  // variant attributes alone (parse-only today). The button unlocks as soon as
  // any one file has rows.
  const canSync = loadedCount > 0 && !busy;

  async function choose(key: FileKey, file: File | null) {
    if (!file) return;
    setError(null);
    setSummary(null);
    try {
      const rows = await parseFile(file);
      setFiles((prev) => ({ ...prev, [key]: rows }));
      setNames((prev) => ({ ...prev, [key]: file.name }));
    } catch {
      setError(`تعذر قراءة ${FILE_LABELS[key]}.`);
    }
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const response = await fetch("/api/taxonomy/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorTypes: files.vendorTypes,
          categories: files.categories,
          variantAttributes: files.variantAttributes,
        }),
      });
      const payload = (await response.json()) as {
        summary?: SyncSummary;
        error?: string;
      };
      if (!response.ok || !payload.summary) {
        throw new Error(payload.error ?? "تعذرت المزامنة.");
      }
      setSummary(payload.summary);
      onSynced?.(
        `تمت المزامنة: ${payload.summary.created} جديد و${payload.summary.updated} محدّث.`,
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "تعذرت المزامنة.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFiles(EMPTY);
    setNames({});
    setSummary(null);
    setError(null);
  }

  return (
    <Modal
      open={open}
      title="مزامنة لوحة التحكم"
      eyebrow="استيراد التصنيفات من V1"
      description="ارفع أي ملف من ملفات CSV من لوحة V1 بشكل مستقل. تُشتق المعرّفات تلقائياً بنفس صيغة البذرة (md5 موسّع بنطاق نوع التاجر) لمنع تصادم المعرّفات بين الأنواع."
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      wide
    >
      <div className="form-stack">
        {(Object.keys(FILE_LABELS) as FileKey[]).map((key) => (
          <label key={key} className="field">
            <span>{FILE_LABELS[key]}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void choose(key, file);
              }}
            />
            <span className="field-hint">
              {names[key]
                ? `${names[key]} · ${files[key].length} صف`
                : key === "variantAttributes"
                  ? "اختياري: يُحلَّل للعرض فقط حالياً."
                  : "اختياري: ارفعه عند الحاجة فقط."}
            </span>
          </label>
        ))}

        <div className="inline-note">
          تم تحليل {parsedCount} صفاً من {loadedCount} ملف. تُزامن التصنيفات فقط
          مع قاعدة البيانات؛ تُستخدم أنواع التجّار لحل الأسماء.
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {summary ? (
          <div className="inline-note" role="status">
            <strong>اكتملت المزامنة</strong>
            <br />
            تم إنشاء {summary.created} وتحديث {summary.updated}. تحليل{" "}
            {summary.categoriesParsed} تصنيفاً من أصل {summary.vendorTypesParsed} نوع
            تاجر
            {summary.duplicates > 0 ? `، و${summary.duplicates} صف مكرر دُمج` : ""}
            {summary.unresolvedParents > 0
              ? `، و${summary.unresolvedParents} أب غير موجود (اعتُبر المستوى الأول)`
              : ""}
            .
            {summary.unknownVendors.length > 0 ? (
              <>
                <br />
                {summary.unknownVendors.length} نوع تاجر غير معروف: ارفع
                vendor-types.csv لاستبدال المعرّف الرقمي باسمه.
              </>
            ) : null}
            {summary.issues.length > 0 ? (
              <>
                <br />
                {summary.issues.length} صفاً لم يُستورد.
              </>
            ) : null}
          </div>
        ) : null}

        <div className="form-actions">
          <Button variant="quiet" onClick={reset} disabled={busy}>
            تصفير
          </Button>
          <Button variant="primary" onClick={() => void sync()} disabled={!canSync}>
            {busy ? "جارٍ المزامنة…" : "بدء المزامنة"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
