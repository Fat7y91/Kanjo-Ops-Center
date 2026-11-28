/**
 * Pure aggregation of operation rows into year-to-date and current-month
 * courier totals.
 *
 * Kept apart from `totals.ts`, which owns the database reads, so the arithmetic
 * can be unit-tested without a Supabase client. Everything here is major units;
 * the repository row's minor-unit integers are converted once, at this boundary.
 */

export type CourierOperationRow = {
  courierId: string;
  /** Courier profit for the order (major units). */
  profit: number;
  /** Order value + delivery fee handled (major units). */
  gross: number;
  /** ISO timestamp the order occurred at. */
  occurredAt: string;
};

export type CourierOperationTotals = {
  earnings: Map<string, number>;
  deliveries: Map<string, number>;
  monthlyDeliveryAmount: Map<string, number>;
  monthlyProfit: Map<string, number>;
};

/** First instant of the current month, in UTC. */
export function startOfMonth(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function add(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function summarizeCourierOperations(
  rows: readonly CourierOperationRow[],
  now: Date,
): CourierOperationTotals {
  const earnings = new Map<string, number>();
  const deliveries = new Map<string, number>();
  const monthlyDeliveryAmount = new Map<string, number>();
  const monthlyProfit = new Map<string, number>();
  const monthStart = startOfMonth(now);

  for (const row of rows) {
    add(earnings, row.courierId, row.profit);
    add(deliveries, row.courierId, 1);

    // Compare the timestamps, not the parsed dates: both are ISO-8601 strings
    // in the same UTC zone, so a lexicographic compare is exact and cheap.
    if (row.occurredAt >= monthStart) {
      add(monthlyDeliveryAmount, row.courierId, row.gross);
      add(monthlyProfit, row.courierId, row.profit);
    }
  }

  return { earnings, deliveries, monthlyDeliveryAmount, monthlyProfit };
}
