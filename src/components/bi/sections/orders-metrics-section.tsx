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
        <div className="order-metrics-waterfall">
          <p className="order-metrics-row-label">حجم النشاط وإجمالي الإيرادات</p>
          <div className="order-metrics-row order-metrics-row-five">
            <WidgetStat
              label="إجمالي حجم الطلبات (GMV)"
              value={money(summary.volume)}
              detail={`${summary.orders} طلب · متوسط ${money(summary.averageOrderValue)}/طلب`}
              tone="purple"
            />
            <WidgetStat
              label="صافي حصة التجار"
              value={money(summary.netMerchantShare)}
              detail="قيمة الطلبات ناقص العمولة"
              tone="gold"
            />
            <WidgetStat
              label="إجمالي العمولات (قبل الخصم)"
              value={money(summary.grossCommission)}
              detail="عمولة التجار قبل أي خصم"
            />
            <WidgetStat
              label="إجمالي رسوم التوصيل (قبل الخصم)"
              value={money(summary.grossDeliveryFees)}
              detail="رسوم التوصيل قبل كوبونات الشحن"
            />
            <WidgetStat
              label="إجمالي إيراد المنصة (Gross Revenue)"
              value={money(summary.grossRevenue)}
              detail="العمولات + رسوم التوصيل"
              tone="purple"
            />
          </div>

          <p className="order-metrics-row-label">
            التكاليف المباشرة وصافي ربح الطلبات
          </p>
          <div className="order-metrics-row order-metrics-row-four">
            <WidgetStat
              label="خصم الكوبونات على الطلبات"
              value={money(summary.orderDiscounts)}
              detail="خصم الطلب + المكافآت + المحفظة"
              tone="red"
            />
            <WidgetStat
              label="خصم الشحن المجاني"
              value={money(summary.shippingDiscount)}
              detail="دعم الشحن الممول من المنصة"
              tone="red"
            />
            <WidgetStat
              label="أجر المناديب على الطلبات"
              value={money(summary.courierProfit)}
              detail="أجر التوصيل لكل طلب قبل الأساس اليومي"
            />
            <WidgetStat
              label="صافي ربح الطلبات (قبل اليوميات الثابتة)"
              value={money(summary.netOrderProfit)}
              detail={`متوسط ${money(summary.netOrderProfit / summary.orders)}/طلب`}
              tone={summary.netOrderProfit >= 0 ? "green" : "red"}
            />
          </div>
        </div>
      )}
    </Widget>
  );
}
