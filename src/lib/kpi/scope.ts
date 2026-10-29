import type { KpiAgent, KpiDataset, KpiScope } from "@/lib/kpi/types";

/**
 * KPI scope resolution (Tier 3, pure).
 *
 * Converts raw filter input + the viewer's authorized cities into the scope the
 * service consumes. Reps are pinned to themselves; only global/level-3 viewers
 * ("admins") may widen the selection to teams, cities or other agents.
 */

export type KpiFilters = {
  cityId: string | null;
  team: string | null;
  agentId: string | null;
  windowDays: number;
};

export type KpiViewer = {
  id: string;
  globalScope: boolean;
  clearanceLevel: number;
};

export const DEFAULT_WINDOW_DAYS = 30;
const WINDOWS = [7, 14, 30, 90] as const;

export function parseKpiFilters(
  params: Record<string, string | string[] | undefined>,
): KpiFilters {
  const single = (value: string | string[] | undefined): string | null => {
    if (Array.isArray(value)) return value[0] ?? null;
    return value && value.trim() ? value.trim() : null;
  };
  const rawWindow = Number(single(params.window));
  const windowDays = (WINDOWS as readonly number[]).includes(rawWindow)
    ? rawWindow
    : DEFAULT_WINDOW_DAYS;

  return {
    cityId: single(params.city),
    team: single(params.team),
    agentId: single(params.agent),
    windowDays,
  };
}

/** Drop filters that cannot apply to a rep-locked view. */
export function normalizeFilters(filters: KpiFilters): KpiFilters {
  return filters;
}

export function isKpiAdmin(viewer: KpiViewer): boolean {
  return viewer.globalScope || viewer.clearanceLevel >= 3;
}

export function resolveKpiScope(input: {
  viewer: KpiViewer;
  allowedCityIds: readonly string[];
  filters: KpiFilters;
  agents: readonly KpiAgent[];
}): {
  scope: KpiScope;
  lockedToSelf: boolean;
  selfAgent: boolean;
  cityId: string | null;
} {
  const { viewer, allowedCityIds, filters, agents } = input;
  const admin = isKpiAdmin(viewer);
  const self = agents.find((agent) => agent.id === viewer.id) ?? null;

  if (!admin) {
    const cityId = self?.cityId ?? null;
    return {
      scope: {
        cityIds: cityId ? [cityId] : [...allowedCityIds],
        agentIds: self ? [self.id] : [],
      },
      lockedToSelf: true,
      selfAgent: Boolean(self),
      cityId,
    };
  }

  const requestedCity =
    filters.cityId && allowedCityIds.includes(filters.cityId)
      ? filters.cityId
      : null;

  const scope: KpiScope = {
    cityIds: requestedCity ? [requestedCity] : [...allowedCityIds],
    team: filters.team,
    agentIds: filters.agentId ? [filters.agentId] : undefined,
  };

  return {
    scope,
    lockedToSelf: false,
    selfAgent: Boolean(self),
    cityId: requestedCity,
  };
}

export function buildKpiFilterOptions(
  dataset: KpiDataset,
  allowedCityIds: readonly string[],
  selectedCityId: string | null,
) {
  const citySet = new Set(allowedCityIds);
  const cities = dataset.cities.filter((city) => citySet.has(city.id));
  const agents = dataset.agents.filter(
    (agent) =>
      citySet.has(agent.cityId) &&
      (!selectedCityId || agent.cityId === selectedCityId),
  );

  const teams = Array.from(new Set(agents.map((agent) => agent.team))).sort(
    (left, right) => left.localeCompare(right, "ar"),
  );

  return {
    cities: cities.map((city) => ({ value: city.id, label: city.name })),
    teams: teams.map((team) => ({ value: team, label: team })),
    agents: agents.map((agent) => ({
      value: agent.id,
      label: agent.name,
      hint: `${agent.team} · ${agent.cityName}`,
    })),
  };
}
