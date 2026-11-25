"use client";

import { useCallback, useState } from "react";

import type {
  ClearingReport,
  ClearingReportKind,
} from "@/lib/operations/clearing-report";
import { exportClearingReportExcel } from "@/lib/operations/clearing-report-excel";
import type { StatementRange } from "@/lib/operations/types";

function query(kind: ClearingReportKind, range: StatementRange): string {
  const params = new URLSearchParams({ kind });
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return params.toString();
}

async function fetchReport(
  kind: ClearingReportKind,
  range: StatementRange,
): Promise<ClearingReport> {
  const response = await fetch(`/api/clearinghouse/report?${query(kind, range)}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as ClearingReport | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "تعذر تحميل التقرير.",
    );
  }
  return payload as ClearingReport;
}

export function useClearingReport() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ClearingReport | null>(null);
  const [kind, setKind] = useState<ClearingReportKind>("collections");
  const [range, setRange] = useState<StatementRange>({ from: null, to: null });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const load = useCallback(
    async (nextKind: ClearingReportKind, nextRange: StatementRange) => {
      setLoading(true);
      setError("");
      try {
        setReport(await fetchReport(nextKind, nextRange));
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذر تحميل التقرير.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const openFor = useCallback(
    (nextKind: ClearingReportKind, nextRange: StatementRange) => {
      setKind(nextKind);
      setRange(nextRange);
      setReport(null);
      setOpen(true);
      void load(nextKind, nextRange);
    },
    [load],
  );

  const close = useCallback(() => {
    setOpen(false);
    setReport(null);
    setError("");
  }, []);

  const retry = useCallback(() => {
    void load(kind, range);
  }, [kind, range, load]);

  const exportFor = useCallback(
    async (nextKind: ClearingReportKind, nextRange: StatementRange) => {
      setExporting(true);
      setExportError("");
      try {
        const data = await fetchReport(nextKind, nextRange);
        if (data.rows.length === 0) {
          setExportError("لا توجد بيانات للتصدير في الفترة المحددة.");
          return;
        }
        await exportClearingReportExcel(data);
      } catch (err) {
        setExportError(
          err instanceof Error ? err.message : "تعذر تصدير ملف Excel.",
        );
      } finally {
        setExporting(false);
      }
    },
    [],
  );

  return {
    open,
    loading,
    error,
    report,
    openFor,
    close,
    retry,
    exporting,
    exportError,
    exportFor,
  };
}
