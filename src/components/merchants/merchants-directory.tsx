"use client";

import Link from "next/link";

import { MerchantAvatar } from "@/components/merchants/merchant-avatar";
import { MerchantFilterBar } from "@/components/merchants/merchant-filter-bar";
import { useMerchantDirectory } from "@/components/merchants/use-merchant-directory";
import type { MerchantRow } from "@/lib/field-ops/payload";

export type { MerchantRow };

/**
 * Plain-language reading of a merchant's signed net position.
 *
 * `due_to_house` is money Kanjo will collect (a receivable); `due_to_merchant`
 * is money Kanjo will pay out (a payable). The label states the direction in the
 * operator's words so the colour is never the only signal.
 */
const BALANCE_TONE_LABEL: Record<MerchantRow["balanceTone"], string> = {
  due_to_house: "لنا عند التاجر",
  due_to_merchant: "للتاجر عندنا",
  settled: "الحساب مسدد",
};

type MerchantsDirectoryProps = {
  rows: MerchantRow[];
  initialQuery: string;
};

/**
 * Merchant directory.
 *
 * Search and the four attribute slicers run client-side against the
 * already-streamed rows, so typing never triggers a server round-trip or a
 * document navigation. The search term is mirrored into the URL so deep links
 * and back/forward stay correct without a full page reload.
 */
export function MerchantsDirectory({
  rows,
  initialQuery,
}: MerchantsDirectoryProps) {
  const {
    filters,
    setFilter,
    reset,
    isFiltered,
    visibleRows,
    cityOptions,
    teamOptions,
    stateOptions,
    categoryOptions,
  } = useMerchantDirectory(rows, initialQuery);

  return (
    <section className="panel">
      <MerchantFilterBar
        filters={filters}
        setFilter={setFilter}
        reset={reset}
        isFiltered={isFiltered}
        resultCount={visibleRows.length}
        cityOptions={cityOptions}
        teamOptions={teamOptions}
        stateOptions={stateOptions}
        categoryOptions={categoryOptions}
      />

      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>التاجر</th>
              <th>المدينة</th>
              <th>الفريق المالك</th>
              <th>الحالة</th>
              <th className="align-center">نسبة العمولة</th>
              <th>الرصيد الحالي</th>
              <th className="align-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="merchant-identity">
                    <MerchantAvatar
                      name={row.name}
                      logoUrl={row.logoUrl}
                      size="lg"
                    />
                    <div className="merchant-identity-text">
                      <Link href={`/merchants/${row.id}`}>
                        <strong>{row.name}</strong>
                      </Link>
                      <span className="muted merchant-category">
                        {row.vendorType}
                      </span>
                    </div>
                  </div>
                </td>
                <td>{row.cityName}</td>
                <td>
                  <span className="chip chip-team">{row.teamLabel}</span>
                </td>
                <td>
                  <span className={`badge ${row.stateTone}`}>
                    {row.stateLabel}
                  </span>
                </td>
                <td dir="ltr" className="align-center">
                  {row.commissionRateLabel}
                </td>
                <td>
                  <span
                    className={`merchant-balance merchant-balance-${row.balanceTone}`}
                    title={BALANCE_TONE_LABEL[row.balanceTone]}
                  >
                    <strong dir="ltr">{row.balanceLabel}</strong>
                    <span className="merchant-balance-note">
                      {BALANCE_TONE_LABEL[row.balanceTone]}
                    </span>
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <Link
                      href={`/merchants/${row.id}`}
                      className="button button-small button-quiet"
                    >
                      فتح الملف
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <p className="empty-state">
                    {isFiltered
                      ? "لا يوجد تاجر مطابق للفلاتر الحالية. جرّب توسيع النطاق أو مسح الفلاتر."
                      : "لا يوجد تجار داخل نطاق مدنك بعد. استخدم زر «إضافة تاجر» لتسجيل أول تاجر."}
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
