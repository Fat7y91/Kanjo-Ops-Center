"use client";

import { useMemo, useState } from "react";

import { Widget, WidgetStat } from "@/components/bi/widget";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { money } from "@/lib/bi/format";
import {
  EMPTY_ORDER_FILTERS,
  filterOrderRows,
  orderMetricOptions,
  summarizeOrderMetrics,
  type OrderMetricFilters,
} from "@/lib/bi/order-metrics";
import { rangeStart } from "@/lib/bi/select";
import type {
  BiCityOption,
  BiOrderMetricRow,
  BiRange,
} from "@/lib/bi/types";

const ALL = "";

type OrdersMetricsSectionProps = {
  rows: BiOrderMetricRow[];
  cities: BiCityOption[];
  range: BiRange;
};

/**
 * Orders metrics module.
 *
 * Volume, platform profit, merchant profit, courier profit and discounts read
 * from the frozen operation ledger. Merchant, courier, city, date and coupon
 * filters narrow the same bucket set, so all five numbers always describe one
 * slice. The date inputs start from the shared dashboard window and may be
 * overridden locally.
 */
export function OrdersMetricsSection({
  rows,
  cities,
  range,
}: OrdersMetricsSectionProps) {
  const [filters, setFilters] = useState<OrderMetricFilters>(
    EMPTY_ORDER_FILTERS,
  );

  const globalFrom = useMemo(
    () => rangeStart(range)?.toISOString().slice(0, 10) ?? "",
    [range],
  );
  const effective = useMemo<OrderMetricFilters>(
    () => ({ ...filters, from: filters.from || globalFrom }),
    [filters, globalFrom],
  );
  const filtered = useMemo(
    () => filterOrderRows(rows, effective),
    [rows, effective],
  );
  const summary = useMemo(() => summarizeOrderMetrics(filtered), [filtered]);
  const options = useMemo(() => orderMetricOptions(rows), [rows]);

  const cityName = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  );

  const cityOptions = [
    { value: ALL, label: "كل المدن" },
    ...options.cities.map((id) => ({
      value: id,
      label: cityName.get(id) ?? id,
    })),
  ];
  const merchantOptions = [
    { value: ALL, label: "كل التجار" },
    ...options.merchants.map((item) => ({ value: item.id, label: item.name })),
  ];
  const courierOptions = [
    { value: ALL, label: "كل المناديب" },
    ...options.couriers.map((item) => ({ value: item.id, label: item.name })),
  ];
  const couponOptions = [
    { value: ALL, label: "كل الكوبونات" },
    ...options.coupons.map((code) => ({ value: code, label: code })),
  ];

  const dirty =
    filters.merchantId !== null ||
    filters.courierId !== null ||
    filters.cityId !== null ||
    filters.couponCode !== null ||
    filters.from !== "" ||
    filters.to !== "";

  function patch(next: Partial<OrderMetricFilters>) {
    setFilters((current) => ({ ...current, ...next }));
  }

  return (
    <Widget
      eyebrow="التشغيل"
      title="مؤشرات الطلبات"
      span={12}
      badge={
        <span className="badge badge-gold">
          {summary.orders} طلب · EGP
        </span>
      }
    >
      <div className="order-metrics-filters">
        <SelectMenu
          label="التاجر"
          value={filters.merchantId ?? ALL}
          onChange={(value) =>
            patch({ merchantId: value === ALL ? null : value })
          }
          options={merchantOptions}
        />
        <SelectMenu
          label="المندوب"
          value={filters.courierId ?? ALL}
          onChange={(value) =>
            patch({ courierId: value === ALL ? null : value })
          }
          options={courierOptions}
        />
        <SelectMenu
          label="المدينة"
          value={filters.cityId ?? ALL}
          onChange={(value) => patch({ cityId: value === ALL ? null : value })}
          options={cityOptions}
        />
        <TextField
          label="من تاريخ"
          type="date"
          value={effective.from}
          onChange={(event) => patch({ from: event.target.value })}
        />
        <TextField
          label="إلى تاريخ"
          type="date"
          value={effective.to}
          onChange={(event) => patch({ to: event.target.value })}
        />
        <SelectMenu
          label="الكوبون"
          value={filters.couponCode ?? ALL}
          onChange={(value) =>
            patch({ couponCode: value === ALL ? null : value })
          }
          options={couponOptions}
        />
        {dirty ? (
          <Button
            size="sm"
            variant="quiet"
            className="order-metrics-reset"
            onClick={() => setFilters(EMPTY_ORDER_FILTERS)}
          >
            إعادة ضبط
          </Button>
        ) : null}
      </div>

      {summary.orders === 0 ? (
        <p className="bi-widget-empty">لا توجد طلبات في هذا النطاق.</p>
      ) : (
        <div className="order-metrics-grid">
          <WidgetStat
            label="إجمالي حجم الطلبات"
            value={money(summary.volume)}
            detail={`${summary.orders} طلب`}
            tone="purple"
          />
          <WidgetStat
            label="ربح المنصة"
            value={money(summary.platformProfit)}
            detail="العمولة ناقص الخصومات الممولة"
            tone="green"
          />
          <WidgetStat
            label="ربح التاجر"
            value={money(summary.merchantProfit)}
            detail="صافي قيمة الطلبات"
            tone="gold"
          />
          <WidgetStat
            label="ربح مندوب التوصيل"
            value={money(summary.courierProfit)}
            detail="حصة التوصيل المجمدة"
          />
          <WidgetStat
            label="إجمالي الخصومات"
            value={money(summary.discounts)}
            detail="كوبونات + محفظة"
            tone="red"
          />
        </div>
      )}
    </Widget>
  );
}
