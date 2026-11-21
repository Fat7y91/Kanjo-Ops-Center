import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  computeProfitability,
  emptyProfitability,
  type AttendanceBaseFact,
  type ProfitOrderFact,
  type ProfitabilitySummary,
} from "./profitability";

/**
 * Delivered-order facts for the P&L waterfall.
 *
 * Orders supply the commission, delivery fee, shipping discount and coupons.
 * The attendance base is read from the posted `5100` debit legs of
 * `courier_attendance` entries, so the footer deduction is the ledger amount,
 * not a recomputed 165 EGP estimate.
 */

const ROW_LIMIT = 20_000;
const TIMEOUT_MS = 8_000;

type RawOrder = {
  courier_id: string;
  delivered_at: string | null;
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

async function loadOrders(from: string | null, to: string | null) {
  const client = getSupabaseServerClient();
  let query = client
    .schema("app")
    .from("operation_logs")
    .select(
      "courier_id,delivered_at,commission_minor,delivery_fee_minor,shipping_discount_minor,discount_minor,reward_discount_minor,merchants(city_id)",
    )
    .eq("currency", "EGP")
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: true })
    .limit(ROW_LIMIT)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

  if (from) query = query.gte("delivered_at", from);
  if (to) query = query.lte("delivered_at", to);
  return query;
}

async function loadAttendance(from: string | null, to: string | null) {
  const client = getSupabaseServerClient();
  let query = client
    .schema("app")
    .from("journal_lines")
    .select("debit_minor,journal_entries!inner(entry_date,source_id,source_type),accounts!inner(code)")
    .eq("accounts.code", "5100")
    .eq("journal_entries.source_type", "courier_attendance")
    .limit(ROW_LIMIT)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

  if (from) query = query.gte("journal_entries.entry_date", from);
  if (to) query = query.lte("journal_entries.entry_date", to);
  return query;
}

async function loadCities() {
  const client = getSupabaseServerClient();
  return client
    .schema("app")
    .from("cities")
    .select("id,name")
    .order("name", { ascending: true })
    .limit(500)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
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
}): Promise<ProfitabilitySummary> {
  const [ordersResult, attendanceResult, citiesResult] = await Promise.all([
    loadOrders(params.from, params.to),
    loadAttendance(params.from, params.to),
    loadCities(),
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
    if (!row.delivered_at) continue;

    facts.push({
      deliveryDate: row.delivered_at,
      cityId,
      courierId: row.courier_id,
      commissionMinor: asMinor(row.commission_minor),
      deliveryFeeMinor: asMinor(row.delivery_fee_minor),
      shippingDiscountMinor: asMinor(row.shipping_discount_minor),
      discountMinor: asMinor(row.discount_minor),
      rewardDiscountMinor: asMinor(row.reward_discount_minor),
    });
  }

  if (attendanceResult.error) {
    if (isMissingSchemaObject(attendanceResult.error)) {
      return computeProfitability(facts, [], meta);
    }
    throw attendanceResult.error;
  }

  const bases: AttendanceBaseFact[] = [];
  // Without a city filter the base is every posted attendance entry in range,
  // so 0-order manual attendance days reconcile with the journal. A city filter
  // can only attribute attendance to courier-days that delivered in that city.
  const cityCourierDays = params.cityId
    ? new Set(
        facts.map((fact) => `${fact.courierId}|${fact.deliveryDate}`),
      )
    : null;

  for (const line of (attendanceResult.data ?? []) as unknown as RawAttendanceLine[]) {
    const entry = embed(line.journal_entries);
    if (!entry) continue;
    const key = attendanceKey(entry.source_id);
    if (!key) continue;
    if (cityCourierDays && !cityCourierDays.has(`${key.courierId}|${key.day}`)) {
      continue;
    }
    bases.push({
      courierId: key.courierId,
      day: key.day,
      amountMinor: asMinor(line.debit_minor),
    });
  }

  return computeProfitability(facts, bases, meta);
}
