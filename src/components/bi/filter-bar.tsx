"use client";

import { Button } from "@/components/ui/button";
import { TextField, ToggleField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  BI_RANGES,
  BI_RANGE_LABELS,
  DEFAULT_BI_FILTERS,
  type BiCityOption,
  type BiFilters,
  type BiRange,
} from "@/lib/bi/types";

type FilterBarProps = {
  filters: BiFilters;
  cities: BiCityOption[];
  teams: string[];
  reps: { id: string; name: string }[];
  vendorTypes: { id: number; name: string }[];
  resultCount: number;
  excludeInternalStaff: boolean;
  onChange: (patch: Partial<BiFilters>) => void;
  onExcludeInternalStaffChange: (next: boolean) => void;
  onReset: () => void;
};

type Option<T extends string | number> = { value: T; label: string };

const ALL = "" as const;

/**
 * Universal filter bar.
 *
 * A single control surface drives every widget below it, so no card can ever
 * display numbers from a different slice than its neighbours.
 */
export function FilterBar({
  filters,
  cities,
  teams,
  reps,
  vendorTypes,
  resultCount,
  excludeInternalStaff,
  onChange,
  onExcludeInternalStaffChange,
  onReset,
}: FilterBarProps) {
  const dirty =
    filters.range !== DEFAULT_BI_FILTERS.range ||
    filters.cityId !== null ||
    filters.team !== null ||
    filters.repId !== null ||
    filters.vendorTypeId !== null ||
    filters.from !== "" ||
    filters.to !== "" ||
    excludeInternalStaff;

  const cityOptions: Option<string>[] = [
    { value: ALL, label: "كل المدن" },
    ...cities.map((city) => ({ value: city.id, label: city.name })),
  ];
  const teamOptions: Option<string>[] = [
    { value: ALL, label: "كل الفرق" },
    ...teams.map((team) => ({ value: team, label: team })),
  ];
  const repOptions: Option<string>[] = [
    { value: ALL, label: "كل المناديب" },
    ...reps.map((rep) => ({ value: rep.id, label: rep.name })),
  ];
  const categoryOptions: Option<string>[] = [
    { value: ALL, label: "كل الفئات" },
    ...vendorTypes.map((vendor) => ({
      value: String(vendor.id),
      label: vendor.name,
    })),
  ];

  return (
    <section className="bi-filterbar" aria-label="الفلاتر الموحدة">
      <div className="bi-filterbar-fields">
        <label className="bi-filter">
          <span>الفترة</span>
          <SelectMenu
            value={filters.range}
            onChange={(range) =>
              onChange({
                range: range as BiRange,
                ...(range === "custom" ? {} : { from: "", to: "" }),
              })
            }
            options={BI_RANGES.map((range) => ({
              value: range,
              label: BI_RANGE_LABELS[range],
            }))}
          />
        </label>

        {filters.range === "custom" ? (
          <>
            <TextField
              fieldClassName="bi-filter"
              label="من (باليوم والساعة)"
              type="datetime-local"
              dir="ltr"
              value={filters.from}
              onChange={(event) => onChange({ from: event.target.value })}
            />
            <TextField
              fieldClassName="bi-filter"
              label="إلى (باليوم والساعة)"
              type="datetime-local"
              dir="ltr"
              value={filters.to}
              onChange={(event) => onChange({ to: event.target.value })}
            />
          </>
        ) : null}

        <label className="bi-filter">
          <span>المدينة</span>
          <SelectMenu
            value={filters.cityId ?? ALL}
            onChange={(cityId) =>
              onChange({ cityId: cityId === ALL ? null : cityId })
            }
            options={cityOptions}
          />
        </label>

        <label className="bi-filter">
          <span>الفريق</span>
          <SelectMenu
            value={filters.team ?? ALL}
            onChange={(team) => onChange({ team: team === ALL ? null : team })}
            options={teamOptions}
          />
        </label>

        <label className="bi-filter">
          <span>المندوب</span>
          <SelectMenu
            value={filters.repId ?? ALL}
            onChange={(repId) =>
              onChange({ repId: repId === ALL ? null : repId })
            }
            options={repOptions}
          />
        </label>

        <label className="bi-filter">
          <span>فئة التاجر</span>
          <SelectMenu
            value={
              filters.vendorTypeId === null
                ? ALL
                : String(filters.vendorTypeId)
            }
            onChange={(value) =>
              onChange({
                vendorTypeId: value === ALL ? null : Number(value),
              })
            }
            options={categoryOptions}
          />
        </label>
      </div>

      <div className="bi-filterbar-meta">
        <ToggleField
          label="استبعاد مستحقات المناديب الداخليين (ZEMBAWY)"
          checked={excludeInternalStaff}
          onChange={onExcludeInternalStaffChange}
        />
        <span className="bi-result-count">{resultCount} تاجر في النطاق</span>
        {dirty ? (
          <Button size="sm" variant="quiet" onClick={onReset}>
            إعادة ضبط
          </Button>
        ) : null}
      </div>
    </section>
  );
}
