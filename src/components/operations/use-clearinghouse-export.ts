"use client";

import { useCallback, useState } from "react";

import {
  buildClearingSheets,
  type ClearingExportInput,
} from "@/lib/operations/clearinghouse-export";

function fileName(): string {
  return `settlement_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

/** Client-only export of the settlement book to a multi-sheet workbook. */
export function useClearinghouseExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const exportBook = useCallback(async (input: ClearingExportInput) => {
    if (input.receivables.length === 0 && input.payables.length === 0) return;
    setBusy(true);
    setError("");

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      workbook.Workbook = { Views: [{ RTL: true }] };

      for (const sheet of buildClearingSheets(input)) {
        const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
        worksheet["!cols"] = [
          { wch: 30 },
          { wch: 16 },
          { wch: 14 },
          { wch: 10 },
          { wch: 14 },
          { wch: 14 },
          { wch: 12 },
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      }

      XLSX.writeFile(workbook, fileName(), { bookType: "xlsx" });
    } catch {
      setError("تعذر تصدير ملف Excel. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, exportBook };
}
