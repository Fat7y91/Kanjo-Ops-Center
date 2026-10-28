"use client";

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
  resultCount: number;
  onChange: (patch: Partial<BiFilters>) => void;
  onReset: () => void;
};

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
  resultCount,
  onChange,
  onReset,
}: FilterBarProps) {
  const dirty =
    filters.range !== "90d" || filters.cityId !== null || filters.team !== null;

  return (
    <section className="bi-filterbar" aria-label="الفلاتر الموحدة">
      <div className="bi-filterbar-fields">
        <label className="bi-filter">
          <span>الفترة</span>
          <select
            value={filters.range}
            onChange={(event) =>
              onChange({ range: event.target.value as BiRange })
            }
          >
            {BI_RANGES.map((range) => (
              <option key={range} value={range}>
                {BI_RANGE_LABELS[range]}
              </option>
            ))}
          </select>
        </label>

        <label className="bi-filter">
          <span>المدينة</span>
          <select
            value={filters.cityId ?? ""}
            onChange={(event) =>
              onChange({ cityId: event.target.value || null })
            }
          >
            <option value="">كل المدن</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>

        <label className="bi-filter">
          <span>الفريق</span>
          <select
            value={filters.team ?? ""}
            onChange={(event) =>
              onChange({ team: event.target.value || null })
            }
          >
            <option value="">كل الفرق</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bi-filterbar-meta">
        <span className="bi-result-count">{resultCount} تاجر في النطاق</span>
        {dirty ? (
          <button
            type="button"
            className="button button-small button-quiet"
            onClick={onReset}
          >
            إعادة ضبط
          </button>
        ) : null}
      </div>
    </section>
  );
}
