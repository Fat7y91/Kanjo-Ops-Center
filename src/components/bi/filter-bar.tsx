"use client";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  BI_RANGES,
  BI_RANGE_LABELS,
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
  onChange: (patch: Partial<BiFilters>) => void;
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
  onChange,
  onReset,
}: FilterBarProps) {
  const dirty =
    filters.range !== "90d" ||
    filters.cityId !== null ||
    filters.team !== null ||
    filters.repId !== null ||
    filters.vendorTypeId !== null;

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
            onChange={(range) => onChange({ range: range as BiRange })}
            options={BI_RANGES.map((range) => ({
              value: range,
              label: BI_RANGE_LABELS[range],
            }))}
          />
        </label>

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
