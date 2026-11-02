import { currencyMoney, shortDate } from "@/lib/accounts/format";

import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "./types";

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

export function operationMethodLabel(value: unknown): string {
  return (
    PAYMENT_METHOD_LABEL[value as PaymentMethod] ?? "طريقة غير معروفة"
  );
}

export function operationDate(value: unknown): string {
  return typeof value === "string" && value !== "" ? shortDate(value) : "—";
}
