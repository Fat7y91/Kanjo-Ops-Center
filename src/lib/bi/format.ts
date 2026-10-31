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
