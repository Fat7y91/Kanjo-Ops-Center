"use client";

import { currencyMoney } from "@/lib/accounts/format";
import { statementClosingLabel } from "@/lib/operations/format";
import { statementTotals } from "@/lib/operations/statement-metrics";
import type { PartyStatement } from "@/lib/operations/types";

export function StatementSummary({
  statement,
}: {
  statement: PartyStatement;
}) {
  const totals = statementTotals(statement.lines);
  const money = (value: number) => currencyMoney(value, statement.currency);
  const cards: { label: string; value: string; closing?: boolean }[] = [
    { label: "إجمالي المدين", value: money(totals.debit) },
    { label: "إجمالي الدائن", value: money(totals.credit) },
  ];

  if (statement.partyType === "courier") {
    cards.push({
      label: "أيام العمل",
      value: String(statement.workingDays ?? 0),
    });
  }
  cards.push({
    label: "عدد الطلبات",
    value: `${statement.orderCount} طلب`,
  });
  cards.push({
    label: `الرصيد الختامي · ${statementClosingLabel(
      statement.partyType,
      statement.balance,
    )}`,
    value: money(Math.abs(statement.balance)),
    closing: true,
  });

  return (
    <div
      className={`statement-summary ${
        statement.partyType === "courier" ? "statement-summary-five" : ""
      }`}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className={card.closing ? "statement-summary-closing" : undefined}
        >
          <span>{card.label}</span>
          <strong dir="ltr">{card.value}</strong>
        </div>
      ))}
    </div>
  );
}
