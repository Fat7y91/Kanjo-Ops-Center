import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { toKanjoBusinessDay } from "@/lib/couriers/tiered-pay";

import {
  computeProfitability,
  emptyProfitability,
  type AttendanceBaseFact,
  type ProfitOrderFact,
  type ProfitabilitySummary,
} from "./profitability";
import { cairoWallToUtc } from "./range";

/**
 * Delivered-order facts for the P&L waterfall.
 *
 * Orders supply the commission, delivery fee, shipping discount and coupons.
 * The attendance base is read from the posted `5100` debit legs of
 * `courier_attendance` entries, so the footer deduction is the ledger amount,
 * not a recomputed 165 EGP estimate.
 *
 * The waterfall is pure accrual: only operation facts and courier-day bases
 * enter it. A settlement or payout never changes these figures. Filtering is
 * done in memory on the Kanjo operating day so a 02:30 delivery groups with the
 * previous day. The fact set is bounded, so this cannot scan unbounded.
 */

const ROW_LIMIT = 20_000;
const TIMEOUT_MS = 8_000;

type RawOrder = {
  courier_id: string;
  occurred_at: string;
  commission_minor: number | string;
  delivery_fee_minor: number | string;
  shipping_discount_minor: number | string;
  discount_minor: number | string;
  reward_discount_minor: number | string;
  merchants:
    | { city_id: string | null }
    | { city_id: string | null }[]
    | null;
};

type RawAttendanceLine = {
  debit_minor: number | string;
  journal_entries:
    | { entry_date: string; source_id: string | null }
    | { entry_date: string; source_id: string | null }[]
    | null;
};

type RawCity = { id: string; name: string };

function embed<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function asMinor(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasTime(value: string) {
  return value.includes("T") || value.includes(" ");
}

function wallToUtc(value: string) {
  /* The dashboard already resolved its window to UTC instants. A bare value
   * from a date picker is Cairo wall clock, so only that shape is converted. */
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value);
  const [day, rest = "00:00"] = value.replace(" ", "T").split("T");
  const [hour = "0", minute = "0"] = rest.split(":");
  return cairoWallToUtc(day, Number(hour), Number(minute));
}

/** Day-granularity membership for attendance rows keyed by operating day. */
function dayInRange(day: string, from: string | null, to: string | null) {
  if (from && day < toKanjoBusinessDay(from)) return false;
  if (to && day > toKanjoBusinessDay(to)) return false;
  return true;
}

/** Instant membership for order rows, honouring a custom date+hour window. */
function orderInRange(
  instant: string,
  day: string,
  from: string | null,
  to: string | null,
) {
  if (from) {
    if (hasTime(from)) {
      if (new Date(instant).getTime() < wallToUtc(from).getTime()) return false;
    } else if (day < from) {
      return false;
    }
  }
  if (to) {
    if (hasTime(to)) {
      if (new Date(instant).getTime() > wallToUtc(to).getTime()) return false;
    } else if (day > to) {
      return false;
    }
  }
  return true;
}

function loadOrders() {
  const client = getSupabaseServerClient();
  return client
    .schema("app")
    .from("operation_logs")
    .select(
      "courier_id,occurred_at,commission_minor,delivery_fee_minor,shipping_discount_minor,discount_minor,reward_discount_minor,merchants(city_id)",
    )
    .eq("currency", "EGP")
    .order("occurred_at", { ascending: true })
    .limit(ROW_LIMIT)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
}

function loadAttendance() {
  const client = getSupabaseServerClient();
  return client
    .schema("app")
    .from("journal_lines")
    .select("debit_minor,journal_entries!inner(entry_date,source_id,source_type),accounts!inner(code)")
    .eq("accounts.code", "5100")
    .eq("journal_entries.source_type", "courier_attendance")
    .eq("journal_entries.status", "posted")
    .limit(ROW_LIMIT)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
}

function loadCities() {
  const client = getSupabaseServerClient();
  return client
    .schema("app")
    .from("cities")
    .select("id,name")
    .order("name", { ascending: true })
    .limit(500)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
}

async function loadInternalStaffIds(): Promise<Set<string>> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select("id")
    .eq("is_internal_staff", true)
    .limit(500)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return new Set();
    throw error;
  }
  return new Set((data ?? []).map((row) => (row as { id: string }).id));
}

/**
 * Parses `attendance:<courierId>:<day>` into the pair the waterfall joins on.
 * A malformed key is ignored instead of aborting the whole card.
 */
function attendanceKey(sourceId: string | null): {
  courierId: string;
  day: string;
} | null {
  if (!sourceId) return null;
  const parts = sourceId.split(":");
  if (parts.length !== 3 || parts[0] !== "attendance") return null;
  if (!parts[1] || !parts[2]) return null;
  return { courierId: parts[1], day: parts[2] };
}

export async function loadProfitability(params: {
  from: string | null;
  to: string | null;
  cityId: string | null;
  excludeInternalStaff?: boolean;
}): Promise<ProfitabilitySummary> {
  const [ordersResult, attendanceResult, citiesResult, internalIds] =
    await Promise.all([
      loadOrders(),
      loadAttendance(),
      loadCities(),
      loadInternalStaffIds(),
    ]);

  const cities: RawCity[] =
    !citiesResult.error && Array.isArray(citiesResult.data)
      ? (citiesResult.data as RawCity[])
      : [];

  const meta = {
    from: params.from,
    to: params.to,
    cityId: params.cityId,
    cities,
  };

  if (ordersResult.error) {
    if (isMissingSchemaObject(ordersResult.error)) {
      return emptyProfitability(meta);
    }
    throw ordersResult.error;
  }

  const facts: ProfitOrderFact[] = [];
  for (const row of (ordersResult.data ?? []) as unknown as RawOrder[]) {
    const merchant = embed(row.merchants);
    const cityId = merchant?.city_id ?? null;
    if (params.cityId && cityId !== params.cityId) continue;

    /* `delivered_at` is a date-only export column; the operating day must
     * come from the real `occurred_at` timestamp (14:00 cutoff). */
    const occurredAt = row.occurred_at;
    const day = toKanjoBusinessDay(occurredAt);
    if (!orderInRange(occurredAt, day, params.from, params.to)) continue;

    facts.push({
      deliveryDate: day,
      cityId,
      courierId: row.courier_id,
      isInternalStaff: internalIds.has(row.courier_id),
      commissionMinor: asMinor(row.commission_minor),
      deliveryFeeMinor: asMinor(row.delivery_fee_minor),
      shippingDiscountMinor: asMinor(row.shipping_discount_minor),
      discountMinor: asMinor(row.discount_minor),
      rewardDiscountMinor: asMinor(row.reward_discount_minor),
    });
  }

  const bases: AttendanceBaseFact[] = [];
  const cityCourierIds = params.cityId
    ? new Set(facts.map((fact) => fact.courierId))
    : null;

  if (!attendanceResult.error) {
    for (const line of (attendanceResult.data ??
      []) as unknown as RawAttendanceLine[]) {
      const entry = embed(line.journal_entries);
      if (!entry) continue;
      const key = attendanceKey(entry.source_id);
      if (!key) continue;
      if (cityCourierIds && !cityCourierIds.has(key.courierId)) continue;
      if (!dayInRange(key.day, params.from, params.to)) continue;
      bases.push({
        courierId: key.courierId,
        day: key.day,
        amountMinor: asMinor(line.debit_minor),
        isInternalStaff: internalIds.has(key.courierId),
      });
    }
  } else if (!isMissingSchemaObject(attendanceResult.error)) {
    throw attendanceResult.error;
  }

  return computeProfitability(facts, bases, meta, {
    excludeInternalStaff: params.excludeInternalStaff,
  });
}
