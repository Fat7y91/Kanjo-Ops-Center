const CURRENCY = new Intl.NumberFormat("ar-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return CURRENCY.format(value);
}
