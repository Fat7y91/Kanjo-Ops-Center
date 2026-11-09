import { currencyMoney, shortDate } from "@/lib/accounts/format";

import {
  AVAILABILITY_LABEL,
  COURIER_STATUS_LABEL,
  type Availability,
  type CourierStatus,
} from "./types";

/**
 * Display helpers for the couriers surface. Rows come from PostgREST, so any
 * value the domain type does not expect must render as a neutral placeholder
 * rather than throw inside a client component.
 */

const SUPPORTED_CURRENCIES = ["EGP", "SAR"] as const;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

function asCurrency(value: unknown): SupportedCurrency | null {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency)
    ? (value as SupportedCurrency)
    : null;
}

export function courierMoney(value: unknown, currency: unknown): string {
  const code = asCurrency(currency);
  const amount = Number(value);
  if (!code || !Number.isFinite(amount)) return "—";
  return currencyMoney(amount, code);
}

export function availabilityLabel(value: unknown): string {
  return AVAILABILITY_LABEL[value as Availability] ?? "غير متصل";
}

export function courierStatusLabel(active: boolean): string {
  const status: CourierStatus = active ? "active" : "inactive";
  return COURIER_STATUS_LABEL[status];
}

export function courierDate(value: unknown): string {
  return typeof value === "string" && value !== "" ? shortDate(value) : "—";
}
