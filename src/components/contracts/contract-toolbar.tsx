"use client";

import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { count } from "@/lib/bi/format";

type ContractsToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  cityId: string | null;
  onCityChange: (value: string | null) => void;
  cities: { id: string; name: string }[];
  shown: number;
  total: number;
};

/**
 * Register search and city filter.
 *
 * Search covers the reference, merchant, signatory and city, which is how an
 * operator actually looks for a paper: "the Desouk deal for ...". The city
 * filter mirrors the column so a manager can review one city before a visit.
 */
export function ContractsToolbar({
  query,
  onQueryChange,
  cityId,
  onCityChange,
  cities,
  shown,
  total,
}: ContractsToolbarProps) {
  const cityOptions = [
    { value: "", label: "كل المدن" },
    ...cities.map((city) => ({ value: city.id, label: city.name })),
  ];

  return (
    <section className="contracts-toolbar" aria-label="تصفية سجل العقود">
      <TextField
        label="بحث"
        placeholder="ابحث برقم العقد أو التاجر أو الموقّع أو المدينة…"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <SelectMenu
        label="المدينة"
        value={cityId ?? ""}
        onChange={(value) => onCityChange(value === "" ? null : value)}
        options={cityOptions}
      />
      <span className="badge badge-gold contracts-toolbar-count">
        {count(shown)} من {count(total)} عقد
      </span>
    </section>
  );
}
