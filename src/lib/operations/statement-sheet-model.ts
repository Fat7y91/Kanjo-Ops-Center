import { statementOrderCountLabel } from "./format";
import { statementTotals } from "./statement-metrics";
import type { PartyStatement } from "./types";

/**
 * The tabular model behind the Excel export, kept pure so it can be unit tested
 * without touching the DOM or the ExcelJS runtime.
 *
 * A merchant statement carries an extra `مندوب التوصيل` column: the merchant
 * is settling orders that a courier delivered, so the courier name belongs next
 * to the order reference. A courier's own statement omits it — there the
 * courier is the account owner, so the column would repeat every row.
 */
export type StatementSheetModel = {
  title: string;
  partyName: string;
  partyTypeLabel: string;
  currency: string;
  periodLabel: string;
  orderCount: number;
  orderCountLabel: string;
  workingDays: number | null;
  debit: number;
  credit: number;
  closing: number;
  headers: string[];
  rows: (string | number)[][];
  totals: (string | number)[];
  /** 1-based index of the first money column. */
  amountStart: number;
  /** 1-based index of the reference column, which may wrap. */
  referenceColumn: number;
};

function periodLabel(statement: PartyStatement): string {
  const { from, to } = statement.period;
  if (!from && !to) return "كل الفترات";
  return `${from ?? "البداية"} ← ${to ?? "الآن"}`;
}

function merchantReference(line: PartyStatement["lines"][number]): string {
  if (line.orderNumber) return `طلب #${line.orderNumber}`;
  return line.memo ? `${line.reference} — ${line.memo}` : line.reference;
}

function courierReference(line: PartyStatement["lines"][number]): string {
  return line.memo ? `${line.reference} — ${line.memo}` : line.reference;
}

export function buildStatementSheet(
  statement: PartyStatement,
): StatementSheetModel {
  const totals = statementTotals(statement.lines);
  const isMerchant = statement.partyType === "merchant";
  const headers = isMerchant
    ? ["التاريخ", "المرجع", "مندوب التوصيل", "مدين", "دائن", "الرصيد"]
    : ["التاريخ", "المرجع", "مدين", "دائن", "الرصيد"];

  const rows = statement.lines.map((line) =>
    isMerchant
      ? [
          line.date,
          merchantReference(line),
          line.courierName?.trim() || "—",
          line.debit,
          line.credit,
          line.running,
        ]
      : [line.date, courierReference(line), line.debit, line.credit, line.running],
  );

  const totalsRow = isMerchant
    ? ["الإجمالي", "", "", totals.debit, totals.credit, statement.balance]
    : ["الإجمالي", "", totals.debit, totals.credit, statement.balance];

  return {
    title: isMerchant ? "كشف حساب تاجر" : "كشف حساب مندوب توصيل",
    partyName: statement.partyName,
    partyTypeLabel: isMerchant ? "تاجر" : "مندوب توصيل",
    currency: statement.currency,
    periodLabel: periodLabel(statement),
    orderCount: statement.orderCount,
    orderCountLabel: statementOrderCountLabel(statement.orderCount),
    workingDays: statement.workingDays ?? null,
    debit: totals.debit,
    credit: totals.credit,
    closing: statement.balance,
    headers,
    rows,
    totals: totalsRow,
    amountStart: headers.indexOf("مدين") + 1,
    referenceColumn: headers.indexOf("المرجع") + 1,
  };
}
