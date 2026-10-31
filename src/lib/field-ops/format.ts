export function formatAmount(value: number): string {
  return new Intl.NumberFormat("ar-EG-u-nu-latn", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
