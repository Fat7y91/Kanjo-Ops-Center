"use client";

import { useMemo } from "react";

import { WidgetStat } from "@/components/bi/widget";
import { money, percent } from "@/lib/bi/format";
import {
  computeNetProfit,
  filterOperatingCosts,
  summarizeOperatingCosts,
} from "@/lib/bi/operating-costs";
import type { BiOperatingCostFact, BiOrderMetricRow } from "@/lib/bi/types";

/**
 * Net Profit row for the orders widget.
 *
 * The order line above already deducts the per-order courier cut and coupons,
 * so this row adds only the fixed costs below it: the courier attendance base,
 * manual bonuses/adjustments and other operating expenses. Costs with no party
 * stay company-wide; only attendance is attributable to a courier and city.
 */
export function NetProfitRow({
  rows,
  operatingCosts,
  filters,
  orderNetProfit,
  volume,
  orders,
}: {
  rows: BiOrderMetricRow[];
  operatingCosts: BiOperatingCostFact[];
  filters: {
    from: string;
    to: string;
    courierId: string | null;
    cityId: string | null;
  };
  orderNetProfit: number;
  volume: number;
  orders: number;
}) {
  const costFacts = useMemo(
    () => (Array.isArray(operatingCosts) ? operatingCosts : []),
    [operatingCosts],
  );
  const courierCityId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const row of rows) {
      if (row.courierId) map.set(row.courierId, row.cityId);
    }
    return map;
  }, [rows]);
  const costs = useMemo(
    () =>
      summarizeOperatingCosts(
        filterOperatingCosts(costFacts, filters, { courierCityId }),
      ),
    [costFacts, filters, courierCityId],
  );
  const net = useMemo(
    () => computeNetProfit(orderNetProfit, volume, orders, costs),
    [orderNetProfit, volume, orders, costs],
  );

  return (
    <>
      <p className="order-metrics-row-label">
        التكاليف التشغيلية وصافي الربح النهائي (Net Profit)
      </p>
      <div className="order-metrics-row order-metrics-row-four order-metrics-row-net">
        <WidgetStat
          label="يوميات المناديب الثابتة"
          value={money(costs.dailyStipends)}
          detail={`${costs.attendanceDays} يوم عمل · حساب 5100`}
          tone="red"
        />
        <WidgetStat
          label="المكافآت والتسويات اليدوية"
          value={money(costs.manualAdjustments)}
          detail="حساب 5110 / 5210 / 4900"
          tone={costs.manualAdjustments > 0 ? "red" : "default"}
        />
        <WidgetStat
          label="مصروفات تشغيلية أخرى"
          value={money(costs.operatingExpenses)}
          detail="حسابات المصروفات 5xxx"
          tone={costs.operatingExpenses > 0 ? "red" : "default"}
        />
        <WidgetStat
          label="صافي الربح النهائي (Net Profit)"
          value={money(net.netProfit)}
          detail={`هامش ${percent(net.netMargin, 1)} · ${money(net.netPerOrder)}/طلب`}
          tone={net.netProfit >= 0 ? "green" : "red"}
        />
      </div>
    </>
  );
}
