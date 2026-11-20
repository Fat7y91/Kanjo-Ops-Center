/**
 * Pure daily courier pay engine.
 *
 * Courier earnings are not a flat per-order rate any more: a partner is paid a
 * fixed daily attendance amount plus two order tiers, all evaluated per calendar
 * day in Cairo time. This module owns that arithmetic and nothing else, so the
 * roster, the statement and the tests all read the same numbers.
 *
 * Money is expressed in minor units (piastres) throughout to avoid float drift.
 * The rates mirror the payroll agreement:
 *   - 165 EGP fixed for every attended day (any delivered order auto-marks it).
 *   - 7 EGP for each of the first 15 delivered orders.
 *   - 15 EGP for each delivered order above 15.
 *
 * The imported orders already carry a 7 EGP courier fee, so the tier-1 rate is
 * the same 7 EGP and must not be added twice. The engine returns the full
 * payable (base + tier1 + tier2); the ledger adjustment is the part above the
 * per-order fee, which the totals layer derives from this summary.
 */

export const COURIER_TIME_ZONE = "Africa/Cairo";

/** 165 EGP fixed daily attendance amount, in piastres. */
export const COURIER_DAILY_BASE_MINOR = 16_500;
/** 7 EGP per delivered order in the first tier, in piastres. */
export const COURIER_TIER1_RATE_MINOR = 700;
/** Orders 1..15 fall in the first tier. */
export const COURIER_TIER1_LIMIT = 15;
/** 15 EGP per delivered order above the target, in piastres. */
export const COURIER_TIER2_RATE_MINOR = 1_500;

export const ATTENDANCE_STATUSES = ["present", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** One delivered order, reduced to the fields the engine needs. */
export type CourierDelivery = {
  courierId: string;
  /** Delivery timestamp (or `YYYY-MM-DD`); the Cairo calendar day is derived. */
  deliveredAt: string;
};

/** A manual attendance override keyed to one courier and one Cairo day. */
export type CourierAttendance = {
  courierId: string;
  /** Cairo calendar day, `YYYY-MM-DD`. */
  day: string;
  status: AttendanceStatus;
};

export type CourierDayPay = {
  day: string;
  deliveredOrders: number;
  /** True when the day counts toward the fixed daily amount. */
  attended: boolean;
  /** Explicit override when one exists, otherwise derived from deliveries. */
  status: AttendanceStatus;
  baseMinor: number;
  tier1Orders: number;
  tier1Minor: number;
  tier2Orders: number;
  tier2Minor: number;
  /** Full payable for the day: base + tier1 + tier2. */
  totalMinor: number;
};

export type CourierPaySummary = {
  days: CourierDayPay[];
  attendanceDays: number;
  deliveredOrders: number;
  baseMinor: number;
  tier1Orders: number;
  tier1Minor: number;
  tier2Orders: number;
  tier2Minor: number;
  /** Full payable across the period: base + tier1 + tier2. */
  totalMinor: number;
};

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COURIER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Resolves a timestamp to its Cairo calendar day (`YYYY-MM-DD`).
 *
 * A bare `YYYY-MM-DD` (no time) is treated as already-a-day, so an import that
 * only carries a date is not shifted by the timezone conversion.
 */
export function cairoDay(value: string): string {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  return dayFormatter.format(parsed);
}

function emptySummary(): CourierPaySummary {
  return {
    days: [],
    attendanceDays: 0,
    deliveredOrders: 0,
    baseMinor: 0,
    tier1Orders: 0,
    tier1Minor: 0,
    tier2Orders: 0,
    tier2Minor: 0,
    totalMinor: 0,
  };
}

/**
 * Folds one courier's deliveries and attendance overrides into a daily pay
 * summary. Days are the union of days with a delivery and days with an explicit
 * attendance row, so a manually marked present day still pays the base even
 * with zero orders, and an absent day still reports its order tiers.
 */
export function computeCourierPay(
  courierId: string,
  deliveries: readonly CourierDelivery[],
  attendance: readonly CourierAttendance[],
): CourierPaySummary {
  const perDay = new Map<string, number>();
  for (const delivery of deliveries) {
    if (delivery.courierId !== courierId) continue;
    const day = cairoDay(delivery.deliveredAt);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  const overrides = new Map<string, AttendanceStatus>();
  for (const row of attendance) {
    if (row.courierId !== courierId) continue;
    overrides.set(row.day, row.status);
  }

  const allDays = new Set<string>([...perDay.keys(), ...overrides.keys()]);
  if (allDays.size === 0) return emptySummary();

  const days: CourierDayPay[] = [];
  for (const day of [...allDays].sort()) {
    const deliveredOrders = perDay.get(day) ?? 0;
    const explicit = overrides.get(day);
    const attended = explicit ? explicit === "present" : deliveredOrders >= 1;
    const status: AttendanceStatus =
      explicit ?? (deliveredOrders >= 1 ? "present" : "absent");

    const baseMinor = attended ? COURIER_DAILY_BASE_MINOR : 0;
    const tier1Orders = Math.min(deliveredOrders, COURIER_TIER1_LIMIT);
    const tier1Minor = tier1Orders * COURIER_TIER1_RATE_MINOR;
    const tier2Orders = Math.max(deliveredOrders - COURIER_TIER1_LIMIT, 0);
    const tier2Minor = tier2Orders * COURIER_TIER2_RATE_MINOR;

    days.push({
      day,
      deliveredOrders,
      attended,
      status,
      baseMinor,
      tier1Orders,
      tier1Minor,
      tier2Orders,
      tier2Minor,
      totalMinor: baseMinor + tier1Minor + tier2Minor,
    });
  }

  return days.reduce<CourierPaySummary>(
    (summary, day) => ({
      days: summary.days,
      attendanceDays: summary.attendanceDays + (day.attended ? 1 : 0),
      deliveredOrders: summary.deliveredOrders + day.deliveredOrders,
      baseMinor: summary.baseMinor + day.baseMinor,
      tier1Orders: summary.tier1Orders + day.tier1Orders,
      tier1Minor: summary.tier1Minor + day.tier1Minor,
      tier2Orders: summary.tier2Orders + day.tier2Orders,
      tier2Minor: summary.tier2Minor + day.tier2Minor,
      totalMinor: summary.totalMinor + day.totalMinor,
    }),
    { ...emptySummary(), days },
  );
}

/**
 * Sums a period across couriers. Used where a single payable figure is needed
 * without drilling into one partner (e.g. the roster footer).
 */
export function summarizeCourierPay(
  deliveries: readonly CourierDelivery[],
  attendance: readonly CourierAttendance[],
): CourierPaySummary {
  const couriers = new Set<string>();
  for (const delivery of deliveries) couriers.add(delivery.courierId);
  for (const row of attendance) couriers.add(row.courierId);

  const parts = [...couriers].map((id) => computeCourierPay(id, deliveries, attendance));
  return parts.reduce<CourierPaySummary>((summary, part) => {
    summary.days.push(...part.days);
    summary.attendanceDays += part.attendanceDays;
    summary.deliveredOrders += part.deliveredOrders;
    summary.baseMinor += part.baseMinor;
    summary.tier1Orders += part.tier1Orders;
    summary.tier1Minor += part.tier1Minor;
    summary.tier2Orders += part.tier2Orders;
    summary.tier2Minor += part.tier2Minor;
    summary.totalMinor += part.totalMinor;
    return summary;
  }, emptySummary());
}
