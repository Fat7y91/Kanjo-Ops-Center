"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { InputControl } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  maskNationalId,
  riderDate,
  riderMoney,
  riderStatusLabel,
} from "@/lib/riders/format";
import type { Rider, RiderStatus } from "@/lib/riders/types";

import type { RiderFilters } from "./use-riders";

type RidersDirectoryProps = {
  rows: Rider[];
  filters: RiderFilters;
  stats: {
    total: number;
    withCustody: number;
    withoutCustody: number;
    custodyValue: number;
  };
  canManage: boolean;
  onFilter: <K extends keyof RiderFilters>(
    key: K,
    value: RiderFilters[K],
  ) => void;
  onIssue: (rider: Rider) => void;
};

const STATUS_OPTIONS: { value: RiderStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "active", label: "نشط" },
  { value: "suspended", label: "موقوف" },
  { value: "offboarded", label: "منتهي" },
];

function statusClass(status: RiderStatus): string {
  if (status === "active") return "badge-green";
  if (status === "suspended") return "badge-red";
  return "badge";
}

export function RidersDirectory({
  rows,
  filters,
  stats,
  canManage,
  onFilter,
  onIssue,
}: RidersDirectoryProps) {
  return (
    <>
      <section className="riders-stats" aria-label="ملخص العهد">
        <div className="riders-stat">
          <span>إجمالي المناديب</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="riders-stat">
          <span>لديهم عهدة</span>
          <strong>{stats.withCustody}</strong>
        </div>
        <div className="riders-stat">
          <span>بدون عهدة</span>
          <strong>{stats.withoutCustody}</strong>
        </div>
        <div className="riders-stat is-accent">
          <span>قيمة العهد النشطة</span>
          <strong dir="ltr">{riderMoney(stats.custodyValue)}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="courier-filters">
          <div className="search-shell">
            <span>بحث</span>
            <InputControl
              type="search"
              value={filters.query}
              onChange={(event) => onFilter("query", event.target.value)}
              placeholder="الاسم أو الكود أو الهاتف أو رقم العهدة"
              aria-label="البحث في مناديب التوصيل والعهد"
              autoComplete="off"
            />
          </div>

          <SelectMenu
            ariaLabel="الحالة"
            value={filters.status}
            options={STATUS_OPTIONS}
            onChange={(value) =>
              onFilter("status", value as RiderStatus | "all")
            }
          />

          <span className="badge" aria-live="polite">
            {rows.length} مندوب
          </span>
        </div>

        <div className="table-wrap w-full overflow-x-auto">
          <table className="data-table riders-table">
            <thead>
              <tr>
                <th>المندوب</th>
                <th>الكود</th>
                <th>الرقم القومي</th>
                <th>الهاتف</th>
                <th>منطقة العمل</th>
                <th>الموقع</th>
                <th>العهدة</th>
                <th>تاريخ التسليم</th>
                <th>القيمة</th>
                <th>الحالة</th>
                <th className="align-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <p className="muted">
                      لا يوجد مناديب مطابقون للتصفية الحالية.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((rider) => {
                  const custody = rider.latestCustody;
                  return (
                    <tr key={rider.id}>
                      <td>
                        <div className="riders-identity">
                          <strong>{rider.fullName}</strong>
                          {rider.activeCustody ? (
                            <span className="riders-custody-dot">عهدة نشطة</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span className="riders-code" dir="ltr">
                          {rider.riderCode || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="riders-national-id" dir="ltr">
                          {maskNationalId(rider.nationalId)}
                        </span>
                      </td>
                      <td dir="ltr">{rider.phone || "—"}</td>
                      <td>{rider.workArea || "—"}</td>
                      <td>
                        <span className="riders-location" dir="ltr">
                          {rider.governorateCode && rider.cityCode
                            ? `${rider.governorateCode} / ${rider.cityCode}`
                            : "—"}
                        </span>
                      </td>
                      <td>
                        {custody ? (
                          <span className="riders-custody" dir="ltr">
                            {custody.custodyNumber}
                          </span>
                        ) : (
                          <span className="muted">لا توجد عهدة</span>
                        )}
                      </td>
                      <td>{custody ? riderDate(custody.deliveryDate) : "—"}</td>
                      <td dir="ltr">
                        {custody ? riderMoney(custody.totalAmount) : "—"}
                      </td>
                      <td>
                        <span className={`badge ${statusClass(rider.status)}`}>
                          {riderStatusLabel(rider.status)}
                        </span>
                      </td>
                      <td className="align-right">
                        <div className="row-actions">
                          {custody ? (
                            <Link
                              href={`/riders/custody/${custody.id}/print`}
                              target="_blank"
                              className="riders-link"
                            >
                              عرض الإيصال
                            </Link>
                          ) : null}
                          {canManage ? (
                            <Button
                              variant="quiet"
                              size="sm"
                              onClick={() => onIssue(rider)}
                            >
                              إصدار عهدة
                            </Button>
                          ) : null}
                          {!custody && !canManage ? (
                            <span className="muted">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
