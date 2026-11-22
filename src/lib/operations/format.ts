import { currencyMoney, shortDate } from "@/lib/accounts/format";

import {
  PAYMENT_METHOD_LABEL,
  type PartyStatement,
  type PartyStatementLine,
  type PaymentMethod,
} from "./types";

/**
 * Display helpers for the operations logger.
 *
 * Rows arrive from PostgREST, so a value the domain type does not expect (a
 * future enum member, a currency outside the treasury pair, a missing
 * timestamp) must render as a neutral placeholder instead of throwing inside a
 * client component. A thrown formatter used to blank the whole `/operations/log`
 * screen.
 */

const SUPPORTED_CURRENCIES = ["EGP", "SAR"] as const;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

function asCurrency(value: unknown): SupportedCurrency | null {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency)
    ? (value as SupportedCurrency)
    : null;
}

export function operationMoney(value: unknown, currency: unknown): string {
  const code = asCurrency(currency);
  const amount = Number(value);
  if (!code || !Number.isFinite(amount)) return "—";
  return currencyMoney(amount, code);
}

export function operationMethodLabel(value: unknown): string {  return (
    PAYMENT_METHOD_LABEL[value as PaymentMethod] ?? "طريقة غير معروفة"
  );
}

export function operationDate(value: unknown): string {
  return typeof value === "string" && value !== "" ? shortDate(value) : "—";
}

export function operationPercent(value: unknown): string {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return "—";
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

export function statementClosingLabel(
  type: PartyStatement["partyType"],
  balance: number,
): string {
  if (Math.abs(balance) < 0.005) return "مطابق";
  if (type === "courier") {
    return balance > 0 ? "مستحق لكانجو" : "مستحق للمندوب";
  }
  return balance > 0 ? "مستحق لكانجو" : "مستحق للتاجر";
}

function compactNumber(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(2).replace(/\.?0+$/, "");
}

/** A single-line description so a weekly statement stays on one A4 page. */
export function statementLineDescription(line: PartyStatementLine): string {
  if (
    line.memo.includes("الحضور اليومي") ||
    line.reference.startsWith("حضور يومي")
  ) {
    return `حضور يومي (${line.date})`;
  }

  if (line.memo.includes("صافي الطلب")) {
    const numbers = line.memo.match(/\d+(?:\.\d+)?/g) ?? [];
    if (numbers.length >= 3) {
      const [value = "0", collected = "0", cut = "0"] = numbers;
      const order = /(\d{4,})/.exec(line.reference)?.[1];
      const head = order ? `طلب #${order}` : line.reference;
      return `${head} (قيمة ${compactNumber(value)} · محصّل ${compactNumber(
        collected,
      )} · أجر ${compactNumber(cut)})`;
    }
  }

  return line.memo.replace(/^صافي الطلب:\s*/, "") || line.reference;
}

export function statementPrintStamp(): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
    }).format(new Date());
  } catch {
    return "";
  }
}

export function statementArabicDate(value?: string): string {
  if (!value) return "—";
  const parsed = new Date(
    value.length === 10 ? `${value}T12:00:00Z` : value,
  );
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
