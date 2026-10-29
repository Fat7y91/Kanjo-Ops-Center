/** Tiny class joiner for the UI primitives. */
export function cx(...values: unknown[]): string {
  return values.filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");
}
