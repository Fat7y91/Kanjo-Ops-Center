"use client";

import { useCallback, useState } from "react";

import { profitabilityRows } from "@/lib/bi/profitability-export";
import type { ProfitabilitySummary } from "@/lib/bi/profitability";

function fileName(): string {
  return `profitability_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

/** Client-only export of the currently filtered P&L rows. */
export function useProfitabilityExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const exportSummary = useCallback(
    async (summary: ProfitabilitySummary, label: string) => {
      setBusy(true);
      setError("");
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.utils.book_new();
        workbook.Workbook = { Views: [{ RTL: true }] };
        const rows = [
          { البند: "الفترة", القيمة: label },
          { البند: "العملة", القيمة: summary.currency },
          { البند: "عدد الطلبات", القيمة: summary.orders },
          ...profitabilityRows(summary),
        ];
        const worksheet = XLSX.utils.json_to_sheet(rows);
        worksheet["!cols"] = [{ wch: 46 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(workbook, worksheet, "ربحية الطلبات");
        XLSX.writeFile(workbook, fileName(), { bookType: "xlsx" });
      } catch {
        setError("تعذر تصدير ملف Excel. أعد المحاولة.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, error, exportSummary };
}
