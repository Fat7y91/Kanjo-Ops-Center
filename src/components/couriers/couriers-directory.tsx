"use client";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  AVAILABILITIES,
  AVAILABILITY_LABEL,
  type Availability,
  type Courier,
  type CourierStatus,
} from "@/lib/couriers/types";
import {
  availabilityLabel,
  courierDate,
  courierMoney,
  courierStatusLabel,
} from "@/lib/couriers/format";

import type { CourierFilters } from "./use-couriers";

type CouriersDirectoryProps = {
  rows: Courier[];
  filters: CourierFilters;
  canManage: boolean;
  onFilter: <K extends keyof CourierFilters>(
    key: K,
    value: CourierFilters[K],
  ) => void;
  onView: (courier: Courier) => void;
  onEdit: (courier: Courier) => void;
  onDelete: (courier: Courier) => void;
};

const STATUS_OPTIONS: { value: CourierStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "active", label: "نشط" },
  { value: "inactive", label: "موقوف" },
];

const AVAILABILITY_OPTIONS: { value: Availability | "all"; label: string }[] = [
  { value: "all", label: "كل حالات التوفر" },
  ...AVAILABILITIES.map((value) => ({
    value,
    label: AVAILABILITY_LABEL[value],
  })),
];

export function CouriersDirectory({
  rows,
  filters,
  canManage,
  onFilter,
  onView,
  onEdit,
  onDelete,
}: CouriersDirectoryProps) {
  return (
    <section className="panel">
      <div className="courier-filters">
        <div className="search-shell">
          <span>بحث</span>
          <input
            type="search"
            name="q"
            value={filters.query}
            onChange={(event) => onFilter("query", event.target.value)}
            placeholder="الاسم أو الهاتف أو البريد الإلكتروني"
            aria-label="البحث عن المناديب"
            autoComplete="off"
          />
        </div>

        <SelectMenu
          ariaLabel="الحالة"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(value) => onFilter("status", value as CourierStatus | "all")}
        />

        <SelectMenu
          ariaLabel="التوفر"
          value={filters.availability}
          options={AVAILABILITY_OPTIONS}
          onChange={(value) =>
            onFilter("availability", value as Availability | "all")
          }
        />

        <span className="badge" aria-live="polite">
          {rows.length} مندوب
        </span>
      </div>

      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table courier-table">
          <thead>
            <tr>
              <th>المندوب</th>
              <th>البريد الإلكتروني</th>
              <th>المركبة / اللوحة</th>
              <th>الربح</th>
              <th>التوفر</th>
              <th>التوصيلات</th>
              <th>الرصيد</th>
              <th>الحالة</th>
              <th>تاريخ التقديم</th>
              <th className="align-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <p className="muted">لا يوجد مناديب مطابقون للتصفية.</p>
                </td>
              </tr>
            ) : (
              rows.map((courier) => (
                <tr key={courier.id}>
                  <td>
                    <div className="courier-identity">
                      <strong>{courier.displayName}</strong>
                      <span dir="ltr">{courier.phone || "—"}</span>
                    </div>
                  </td>
                  <td dir="ltr">{courier.email || "—"}</td>
                  <td>
                    <div className="courier-vehicle">
                      <span>{courier.vehicleType || "—"}</span>
                      <span dir="ltr">{courier.vehiclePlate || "—"}</span>
                    </div>
                  </td>
                  <td dir="ltr">{courierMoney(courier.earnings, "EGP")}</td>
                  <td>
                    <span className={`badge badge-${availabilityTone(courier.availability)}`}>
                      {availabilityLabel(courier.availability)}
                    </span>
                  </td>
                  <td dir="ltr">{courier.deliveries}</td>
                  <td dir="ltr">{courierMoney(courier.balance, "EGP")}</td>
                  <td>
                    <span className={`badge badge-${courier.active ? "green" : "red"}`}>
                      {courierStatusLabel(courier.active)}
                    </span>
                  </td>
                  <td>{courierDate(courier.appliedAt)}</td>
                  <td className="align-right">
                    <div className="row-actions">
                      <Button variant="quiet" size="sm" onClick={() => onView(courier)}>
                        عرض
                      </Button>
                      {canManage ? (
                        <DropdownMenu
                          label="إدارة"
                          buttonClassName="text-xs"
                          items={[
                            {
                              id: "edit",
                              label: "تعديل",
                              onSelect: () => onEdit(courier),
                            },
                            {
                              id: "delete",
                              label: "حذف",
                              tone: "danger",
                              onSelect: () => onDelete(courier),
                            },
                          ]}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function availabilityTone(availability: Availability): string {
  if (availability === "available") return "green";
  if (availability === "busy") return "gold";
  return "red";
}
