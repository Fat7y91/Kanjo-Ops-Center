"use client";

import { SelectMenu } from "@/components/ui/select-menus";
import type { MerchantFilters } from "@/components/merchants/use-merchant-directory";

type MerchantFilterBarProps = {
  filters: MerchantFilters;
  setFilter: <K extends keyof MerchantFilters>(
    key: K,
    value: MerchantFilters[K],
  ) => void;
  reset: () => void;
  isFiltered: boolean;
  resultCount: number;
  cityOptions: string[];
  teamOptions: string[];
  stateOptions: string[];
  categoryOptions: Array<{ value: number; label: string }>;
};

/**
 * Directory slicers.
 *
 * Every control is a Headless UI select, never a native element, and keeps an
 * explicit "all" sentinel so an empty filter is a real choice rather than a
 * cleared control that looks broken. The reset button only appears once at
 * least one slicer narrows the list.
 */
export function MerchantFilterBar({
  filters,
  setFilter,
  reset,
  isFiltered,
  resultCount,
  cityOptions,
  teamOptions,
  stateOptions,
  categoryOptions,
}: MerchantFilterBarProps) {
  return (
    <div className="merchant-filters">
      <div className="search-shell">
        <span>بحث</span>
        <input
          type="search"
          name="q"
          value={filters.query}
          onChange={(event) => setFilter("query", event.target.value)}
          placeholder="اسم التاجر أو الإملاء العربي أو خطأ إملائي"
          aria-label="البحث عن التجار"
          autoComplete="off"
        />
      </div>

      <SelectMenu
        className="merchant-filter-select"
        ariaLabel="المدينة"
        value={filters.cityName ?? "all"}
        onChange={(value) =>
          setFilter("cityName", value === "all" ? null : (value as string))
        }
        options={[
          { value: "all", label: "كل المدن" },
          ...cityOptions.map((city) => ({ value: city, label: city })),
        ]}
      />

      <SelectMenu
        className="merchant-filter-select"
        ariaLabel="الفريق المالك"
        value={filters.teamLabel ?? "all"}
        onChange={(value) =>
          setFilter("teamLabel", value === "all" ? null : (value as string))
        }
        options={[
          { value: "all", label: "كل الفرق" },
          ...teamOptions.map((team) => ({ value: team, label: team })),
        ]}
      />

      <SelectMenu
        className="merchant-filter-select"
        ariaLabel="نوع التاجر"
        value={filters.vendorTypeId ?? "all"}
        onChange={(value) =>
          setFilter(
            "vendorTypeId",
            value === "all" ? null : (value as number),
          )
        }
        options={[
          { value: "all", label: "كل الأنواع" },
          ...categoryOptions.map((category) => ({
            value: category.value,
            label: category.label,
          })),
        ]}
      />

      <SelectMenu
        className="merchant-filter-select"
        ariaLabel="الحالة"
        value={filters.stateLabel ?? "all"}
        onChange={(value) =>
          setFilter("stateLabel", value === "all" ? null : (value as string))
        }
        options={[
          { value: "all", label: "كل الحالات" },
          ...stateOptions.map((state) => ({ value: state, label: state })),
        ]}
      />

      <div className="merchant-filters-meta">
        <span className="badge" aria-live="polite">
          {resultCount} نتيجة
        </span>
        {isFiltered ? (
          <button type="button" className="button button-quiet" onClick={reset}>
            مسح الفلاتر
          </button>
        ) : null}
      </div>
    </div>
  );
}
