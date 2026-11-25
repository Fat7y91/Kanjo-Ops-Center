"use client";

import { useCallback, useState } from "react";

import { exportStatementExcel } from "@/lib/operations/statement-excel";
import type { PartyStatement } from "@/lib/operations/types";

export function useStatementExcel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const exportStatement = useCallback(async (statement: PartyStatement) => {
    setBusy(true);
    setError("");
    try {
      await exportStatementExcel(statement);
    } catch {
      setError("تعذر تصدير ملف Excel. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, exportStatement };
}
