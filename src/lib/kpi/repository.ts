import { listCities } from "@/lib/field-ops/store";
import { currentMonthKey, isCurrentMonth } from "@/lib/kpi/calendar";
import type { KpiAgent, KpiCity, KpiDataset, KpiRankFact, KpiVaultRaw } from "@/lib/kpi/types";
import { loadAgentKpiRanks } from "@/lib/kpi/rank-repository";
import {
  isKpiVaultConfigured,
  loadLiveMonthVault,
  loadSnapshotMonthVault,
} from "@/lib/kpi/vault";
import { listUsers } from "@/lib/rbac/users";
import type { AppUser } from "@/lib/rbac/types";

/**
 * Agent KPI repository (Tier 4).
 *
 * The roster comes from the RBAC store (Supabase, with the seed fallback for
 * local dev) and the city catalogue from the field-ops store. Every number
 * comes from the SQL KPI Vault: live per-record attribution for the current
 * month, immutable `app.kpi_snapshots` for history. No in-memory KPI mocks
 * exist anymore — a missing database yields an `unavailable` vault and honest
 * zeros, never fabricated figures.
 */

const REP_TITLE = "مندوب ميداني";

function isFieldAgent(user: AppUser): boolean {
  return (
    user.active &&
    user.title === REP_TITLE &&
    user.clearanceLevel <= 2 &&
    user.permissions.includes("start_end_visit")
  );
}

export async function loadKpiDataset(month: string): Promise<KpiDataset> {
  const cities = new Map(listCities().map((city) => [city.id, city]));
  const users = (await listUsers()).filter(isFieldAgent);

  const agents: KpiAgent[] = users.flatMap((user) => {
    const cityId = user.accessibleCities[0];
    const city = cityId ? cities.get(cityId) : null;
    if (!city) return [];
    return [
      {
        id: user.id,
        name: user.name,
        team: user.teamName ?? (user.team || "غير مسند"),
        teamId: user.teamId ?? null,
        cityId: city.id,
        cityName: city.name,
        stage: city.stage,
      },
    ];
  });

  const kpiCities: KpiCity[] = Array.from(
    new Map(
      agents.map((agent) => {
        const city = cities.get(agent.cityId);
        return [
          agent.cityId,
          { id: agent.cityId, name: agent.cityName, stage: agent.stage },
        ] as const;
      }),
    ).values(),
  );

  const vault = await loadVault(month);
  const ranksByRep: Map<string, KpiRankFact> = isCurrentMonth(month)
    ? ((await loadAgentKpiRanks()) ?? new Map())
    : new Map();

  return { cities: kpiCities, agents, vault, ranksByRep, month };
}

async function loadVault(month: string): Promise<KpiVaultRaw> {
  const empty: KpiVaultRaw = {
    source: "unavailable",
    activationsByRep: new Map(),
    itemsByRep: new Map(),
    contractsByTeam: new Map(),
    ratesByCity: new Map(),
    snapshotsByRep: new Map(),
  };
  if (!isKpiVaultConfigured()) return empty;

  if (isCurrentMonth(month)) {
    const live = await loadLiveMonthVault(month);
    if (!live) return empty;
    return { source: "live", ...live, snapshotsByRep: new Map() };
  }

  const snapshots = await loadSnapshotMonthVault(month);
  if (!snapshots) return empty;
  return {
    source: "snapshot",
    activationsByRep: new Map(),
    itemsByRep: new Map(),
    contractsByTeam: new Map(),
    ratesByCity: new Map(),
    snapshotsByRep: snapshots,
  };
}

/** Resolve a session user to the KPI agent record that represents them. */
export async function findAgentForUser(userId: string): Promise<KpiAgent | null> {
  const dataset = await loadKpiDataset(currentMonthKey());
  return dataset.agents.find((agent) => agent.id === userId) ?? null;
}

/** Cities that currently hold at least one KPI agent, for the filter bar. */
export async function listKpiCities(): Promise<KpiCity[]> {
  return (await loadKpiDataset(currentMonthKey())).cities;
}

/** Agent roster used by the admin filter (id/name/team/city only). */
export async function listKpiAgents(): Promise<KpiAgent[]> {
  return (await loadKpiDataset(currentMonthKey())).agents;
}
