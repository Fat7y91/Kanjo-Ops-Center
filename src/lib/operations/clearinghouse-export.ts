import { clearingWorkingDays, type ClearingRange } from "./clearinghouse-view";
import type { ClearingAccountRow, ClearingPartyType } from "./types";

/** Builders for the multi-sheet settlement workbook. Pure and testable. */

export type ClearingExportTotals = {
  receivables: number;
  payables: number;
  net: number;
};

export type ClearingExportInput = {
  periodLabel: string;
  generatedAt: string;
  range: ClearingRange;
  totals: ClearingExportTotals;
  receivables: ClearingAccountRow[];
  payables: ClearingAccountRow[];
};

export type ClearingSheet = {
  name: string;
  rows: Record<string, string | number>[];
};

const PARTY_LABEL: Record<ClearingPartyType, string> = {
  merchant: "تاجر",
  courier: "مندوب توصيل",
};

function accountRow(
  account: ClearingAccountRow,
  range: ClearingRange,
): Record<string, string | number> {
  return {
    الطرف: account.partyName,
    النوع: PARTY_LABEL[account.partyType],
    المبلغ: Math.round(Math.abs(account.balance) * 100) / 100,
    العملة: account.currency,
    "آخر نشاط": account.lastActivityAt ?? "",
    "آخر تسوية": account.lastSettlementAt ?? "",
    "أيام العمل":
      account.partyType === "courier"
        ? clearingWorkingDays(account, range)
        : "",
  };
}

export function buildClearingSheets(input: ClearingExportInput): ClearingSheet[] {
  return [
    {
      name: "الملخص",
      rows: [
        { البند: "الفترة", القيمة: input.periodLabel },
        { البند: "تاريخ التصدير", القيمة: input.generatedAt },
        { البند: "إجمالي مستحق لنا", القيمة: input.totals.receivables },
        { البند: "إجمالي مستحق لهم", القيمة: input.totals.payables },
        { البند: "الصافي", القيمة: input.totals.net },
        { البند: "حسابات مستحق لنا", القيمة: input.receivables.length },
        { البند: "حسابات مستحق لهم", القيمة: input.payables.length },
      ],
    },
    {
      name: "مستحق لنا",
      rows: input.receivables.map((account) => accountRow(account, input.range)),
    },
    {
      name: "مستحق لهم",
      rows: input.payables.map((account) => accountRow(account, input.range)),
    },
  ];
}
