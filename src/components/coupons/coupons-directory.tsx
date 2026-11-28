"use client";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  COUPON_TYPES,
  COUPON_TYPE_LABEL,
  type Coupon,
  type CouponType,
} from "@/lib/coupons/types";
import {
  couponDate,
  couponFundingLabel,
  couponMoney,
  couponTypeLabel,
  couponValueLabel,
} from "@/lib/coupons/format";

import type { CouponFilters } from "./use-coupons";

type CouponsDirectoryProps = {
  rows: Coupon[];
  filters: CouponFilters;
  canManage: boolean;
  onFilter: <K extends keyof CouponFilters>(
    key: K,
    value: CouponFilters[K],
  ) => void;
  onEdit: (coupon: Coupon) => void;
  onDelete: (coupon: Coupon) => void;
};

const STATUS_OPTIONS: { value: CouponFilters["status"]; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "active", label: "نشط" },
  { value: "inactive", label: "موقوف" },
];

const TYPE_OPTIONS: { value: CouponType | "all"; label: string }[] = [
  { value: "all", label: "كل الأنواع" },
  ...COUPON_TYPES.map((type) => ({ value: type, label: COUPON_TYPE_LABEL[type] })),
];

export function CouponsDirectory({
  rows,
  filters,
  canManage,
  onFilter,
  onEdit,
  onDelete,
}: CouponsDirectoryProps) {
  return (
    <section className="panel">
      <div className="coupon-filters">
        <div className="search-shell">
          <span>بحث</span>
          <input
            type="search"
            name="q"
            value={filters.query}
            onChange={(event) => onFilter("query", event.target.value)}
            placeholder="كود الكوبون"
            aria-label="البحث عن الكوبونات"
            autoComplete="off"
          />
        </div>

        <SelectMenu
          ariaLabel="النوع"
          value={filters.type}
          options={TYPE_OPTIONS}
          onChange={(value) => onFilter("type", value as CouponType | "all")}
        />

        <SelectMenu
          ariaLabel="الحالة"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(value) =>
            onFilter("status", value as CouponFilters["status"])
          }
        />

        <span className="badge" aria-live="polite">
          {rows.length} كوبون
        </span>
      </div>

      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table coupon-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>النوع</th>
              <th>القيمة</th>
              <th>التمويل</th>
              <th>الميزانية</th>
              <th>الاستخدام</th>
              <th>الحالة</th>
              <th className="align-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <p className="muted">لا توجد كوبونات مطابقة للتصفية.</p>
                </td>
              </tr>
            ) : (
              rows.map((coupon) => (
                <tr key={coupon.id}>
                  <td>
                    <span className="coupon-code">{coupon.code}</span>
                  </td>
                  <td>{couponTypeLabel(coupon.couponType)}</td>
                  <td dir="ltr">
                    <span className="coupon-value">
                      {couponValueLabel(coupon)}
                    </span>
                  </td>
                  <td>
                    <span className="coupon-funding">
                      {couponFundingLabel(coupon.discountFundedBy)}
                      {coupon.vendorFundingPercent > 0
                        ? ` · تاجر ${coupon.vendorFundingPercent}%`
                        : ""}
                    </span>
                  </td>
                  <td>
                    <div className="coupon-budget">
                      <span dir="ltr">
                        {coupon.budgetCap === null
                          ? "بلا سقف"
                          : couponMoney(coupon.budgetCap)}
                      </span>
                      {coupon.budgetRemaining !== null ? (
                        <span dir="ltr">
                          متبقٍ {couponMoney(coupon.budgetRemaining)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td dir="ltr">{coupon.usesCount}</td>
                  <td>
                    <span
                      className={`badge badge-${coupon.active ? "green" : "red"}`}
                    >
                      {coupon.active ? "نشط" : "موقوف"}
                    </span>
                    <span className="muted"> {couponDate(coupon.createdAt)}</span>
                  </td>
                  <td className="align-right">
                    <div className="row-actions">
                      {canManage ? (
                        <DropdownMenu
                          label="إدارة"
                          buttonClassName="text-xs"
                          items={[
                            {
                              id: "edit",
                              label: "تعديل",
                              onSelect: () => onEdit(coupon),
                            },
                            {
                              id: "delete",
                              label: "حذف",
                              tone: "danger",
                              onSelect: () => onDelete(coupon),
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
