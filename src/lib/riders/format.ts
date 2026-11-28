import type { RiderStatus } from "./types";

const MONEY = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  year: "numeric",
  month: "long",
  day: "2-digit",
});

const DATE_SHORT = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export function riderMoney(value: number): string {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${MONEY.format(safe)} ج.م`;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function riderDate(value: string): string {
  const date = parseDate(value);
  return date ? DATE.format(date) : "—";
}

export function riderShortDate(value: string): string {
  const date = parseDate(value);
  return date ? DATE_SHORT.format(date) : "—";
}

export function riderStatusLabel(status: RiderStatus): string {
  if (status === "active") return "نشط";
  if (status === "suspended") return "موقوف";
  return "منتهي";
}

export function maskNationalId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value || "—";
  return `${digits.slice(0, 4)}********${digits.slice(-2)}`;
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function riderInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "؟";
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0].slice(0, 1)}${words[words.length - 1].slice(0, 1)}`;
}
