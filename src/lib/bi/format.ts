const CURRENCY = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

const COMPACT = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const COUNT = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  maximumFractionDigits: 0,
});

/** Money without its currency glyph; the widget renders the glyph separately. */
const AMOUNT = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const SYMBOLS = { EGP: "ج.م", SAR: "ر.س" } as const;

export function amount(value: number): string {
  return AMOUNT.format(value);
}

export function currencySymbol(currency: "EGP" | "SAR"): string {
  return SYMBOLS[currency];
}

export function money(value: number): string {
  return CURRENCY.format(value);
}

export function compact(value: number): string {
  return COMPACT.format(value);
}

export function count(value: number): string {
  return COUNT.format(value);
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function ratioLabel(achieved: number, target: number): string {
  if (target === 0) return "لا يوجد هدف";
  return percent(achieved / target, 1);
}
