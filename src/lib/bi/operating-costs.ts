import type { BiOperatingCostFact } from "./types";

/**
 * Net Profit row for the orders widget.
 *
 * The order line already deducts the per-order courier cut and coupon expense
 * (both live on the frozen order), so this module reads only the fixed costs
 * below it from the posted journal:
 *
 *   daily stipends      = 5100 debits posted from `courier_attendance`
 *   manual adjustments  = 5110 + 5210 debits, less 4900 credits
 *   operating expenses  = every other 5xxx expense account
 *
 * Net Profit = order net profit - (stipends + adjustments + operating expenses)
 * Net Margin = Net Profit / GMV
 * Net/Order  = Net Profit / orders
 */
/** Accounts already netted off the order profit; never deducted twice. */
const ORDER_COST_CODES = new Set(["5000", "5100"]);

/** Bonus / adjustment accounts folded into the manual-adjustment line. */
const ADJUSTMENT_CODES = new Set(["5110", "5210", "4900"]);

const toMajor = (minor: number) => Math.round(minor) / 100;

export type OperatingCostFilters = {
  /** Inclusive ISO day bounds; empty means unbounded. */
  from: string;
  to: string;
  courierId: string | null;
  /** Couriers map to a city through the orders they delivered. */
  cityId: string | null;
};

export type OperatingCostLookups = {
  courierCityId: ReadonlyMap<string, string | null>;
};

export type OperatingCostSummary = {
  /** Distinct courier-days behind the attendance base. */
  attendanceDays: number;
  dailyStipends: number;
  manualAdjustments: number;
  operatingExpenses: number;
  totalCosts: number;
};

export type NetProfitSummary = OperatingCostSummary & {
  netProfit: number;
  /** Net Profit over GMV, as a ratio (0.12 = 12%). */
  netMargin: number;
  netPerOrder: number;
};

/** Courier id encoded in `attendance:<courierId>:<day>`, else null. */
function attendanceCourierId(fact: BiOperatingCostFact): string | null {
  if (fact.sourceType !== "courier_attendance" || !fact.sourceId) return null;
  const [, courierId] = fact.sourceId.split(":");
  return courierId || null;
}

/**
 * Applies the orders module's window and entity filters to the cost legs.
 *
 * Only the attendance base is attributable to one courier (through the entry's
 * `source_id`) and therefore to that courier's city. Bonuses and other operating
 * expenses post against control accounts with no party, so they stay company-wide
 * and are never dropped by a courier or city filter.
 */
export function filterOperatingCosts(
  facts: readonly BiOperatingCostFact[],
  filters: OperatingCostFilters,
  lookups: OperatingCostLookups,
): BiOperatingCostFact[] {
  return facts.filter((fact) => {
    if (filters.from && fact.day < filters.from) return false;
    if (filters.to && fact.day > filters.to) return false;

    const courierId = attendanceCourierId(fact);
    if (!courierId) return true;

    if (filters.courierId && courierId !== filters.courierId) return false;
    if (filters.cityId) {
      const city = lookups.courierCityId.get(courierId);
      if (city && city !== filters.cityId) return false;
    }
    return true;
  });
}

export function summarizeOperatingCosts(
  facts: readonly BiOperatingCostFact[],
): OperatingCostSummary {
  let dailyStipends = 0;
  let manualAdjustments = 0;
  let operatingExpenses = 0;
  const attendanceKeys = new Set<string>();

  for (const fact of facts) {
    const signed = fact.debitMinor - fact.creditMinor;

    if (fact.code === "5100") {
      /* Operations post the per-order courier cut to the same account; only
       * the attendance base is deducted again here. */
      if (fact.sourceType !== "courier_attendance") continue;
      dailyStipends += signed;
      if (fact.sourceId) attendanceKeys.add(fact.sourceId);
      continue;
    }

    if (ADJUSTMENT_CODES.has(fact.code)) {
      manualAdjustments += signed;
      continue;
    }

    if (ORDER_COST_CODES.has(fact.code)) continue;
    if (fact.code.startsWith("5")) operatingExpenses += signed;
  }

  return {
    attendanceDays: attendanceKeys.size,
    dailyStipends: toMajor(dailyStipends),
    manualAdjustments: toMajor(manualAdjustments),
    operatingExpenses: toMajor(operatingExpenses),
    totalCosts: toMajor(dailyStipends + manualAdjustments + operatingExpenses),
  };
}

export function computeNetProfit(
  orderNetProfit: number,
  volume: number,
  orders: number,
  costs: OperatingCostSummary,
): NetProfitSummary {
  const netProfit = orderNetProfit - costs.totalCosts;
  return {
    ...costs,
    netProfit,
    netMargin: volume > 0 ? netProfit / volume : 0,
    netPerOrder: orders > 0 ? netProfit / orders : 0,
  };
}
