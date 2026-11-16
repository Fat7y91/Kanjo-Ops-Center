"use client";

import { useMemo, useState } from "react";

import type { Contract } from "@/lib/contracts/types";

type CityOption = { id: string; name: string };

/**
 * Register filtering state.
 *
 * The register is a short list (a few hundred rows), so search and the city
 * filter run in the browser over the already-scoped payload. Keeping the state
 * in one hook means the toolbar and the table read the same filtered rows and
 * the "shown of total" counter can never disagree with what is rendered.
 */
export function useContractFilters(
  contracts: Contract[],
  cities: CityOption[],
) {
  const [query, setQuery] = useState("");
  const [cityId, setCityId] = useState<string | null>(null);

  const cityNameById = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contracts.filter((contract) => {
      if (cityId && contract.cityId !== cityId) return false;
      if (!needle) return true;
      const cityName = contract.cityId
        ? (cityNameById.get(contract.cityId) ?? "")
        : "";
      return `${contract.reference} ${contract.merchantName} ${contract.signatory} ${cityName}`
        .toLowerCase()
        .includes(needle);
    });
  }, [contracts, cityId, cityNameById, query]);

  return {
    query,
    setQuery,
    cityId,
    setCityId,
    cityNameById,
    filtered,
    total: contracts.length,
  };
}
