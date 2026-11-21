/** Currency-aware money formatting. Digits stay Western (Latin) everywhere. */

const FORMATTERS: Record<"EGP" | "SAR", Intl.NumberFormat> = {
  EGP: new Intl.NumberFormat("ar-EG-u-nu-latn", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }),
  SAR: new Intl.NumberFormat("ar-EG-u-nu-latn", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }),
};

export function currencyMoney(value: number, currency: "EGP" | "SAR"): string {
  return FORMATTERS[currency].format(value);
}

const DATE = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : DATE.format(date);
}

const DATE_TIME = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/** Exact date and time, for an audit voucher where the minute matters. */
export function fullDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : DATE_TIME.format(date);
}
