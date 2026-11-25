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
    return balance > 0 ? "مستحق لكانچو" : "مستحق للمندوب";
  }
  return balance > 0 ? "مستحق لكانچو" : "مستحق للتاجر";
}

function compactNumber(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(2).replace(/\.?0+$/, "");
}

/** Pieces of a statement row so the UI can highlight the courier tag. */
export type StatementLineParts = {
  /** Text before the courier tag. */
  lead: string;
  /** Assigned courier, present only on merchant order rows that recorded one. */
  courierName: string | null;
  /** Text after the courier tag. */
  tail: string;
};

/**
 * Split a statement row into its lead / courier / tail pieces.
 *
 * The courier is pulled out of the free-text description so the screen, the A4
 * print and the Excel export can each style it without re-parsing a sentence.
 */
export function statementLineParts(
  line: PartyStatementLine,
  currency: PartyStatement["currency"] = "EGP",
): StatementLineParts {
  if (
    line.memo.includes("الحضور اليومي") ||
    line.reference.startsWith("حضور يومي")
  ) {
    return { lead: `حضور يومي (${line.date})`, courierName: null, tail: "" };
  }

  if (line.memo.includes("صافي الطلب")) {
    const numbers = line.memo.match(/\d+(?:\.\d+)?/g) ?? [];
    if (numbers.length >= 3) {
      const [value = "0", collected = "0", cut = "0"] = numbers;
      const order = /(\d{4,})/.exec(line.reference)?.[1];
      const head = order ? `طلب #${order}` : line.reference;
      return {
        lead: `${head} (قيمة ${compactNumber(value)} · محصّل ${compactNumber(
          collected,
        )} · أجر ${compactNumber(cut)})`,
        courierName: null,
        tail: "",
      };
    }
  }

  if (line.orderNumber && line.orderValue !== undefined) {
    const rate =
      line.commissionPercent !== undefined
        ? ` (عمولة ${compactNumber(String(line.commissionPercent))}%)`
        : "";
    return {
      lead: `طلب #${line.orderNumber}`,
      courierName: line.courierName?.trim() || null,
      tail: ` — قيمة الطلب: ${currencyMoney(line.orderValue, currency)}${rate}`,
    };
  }

  return {
    lead: line.memo.replace(/^صافي الطلب:\s*/, "") || line.reference,
    courierName: null,
    tail: "",
  };
}

/** A single-line description so a weekly statement stays on one A4 page. */
export function statementLineDescription(
  line: PartyStatementLine,
  currency: PartyStatement["currency"] = "EGP",
): string {
  const parts = statementLineParts(line, currency);
  const tag = parts.courierName ? ` · المندوب: ${parts.courierName}` : "";
  return `${parts.lead}${tag}${parts.tail}`;
}

/**
 * Arabic pluralises 1 and 2 differently from 3-10 and 11+, so the order count
 * must not be pasted next to a single fixed noun.
 */
export function statementOrderCountLabel(count: number): string {
  const value = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (value === 1) return "1 طلب";
  if (value >= 2 && value <= 10) return `${value} طلبات`;
  return `${value} طلب`;
}

export function statementPrintStamp(): string {
  try {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
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
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
