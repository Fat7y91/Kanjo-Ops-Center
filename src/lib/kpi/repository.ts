import { listProducts } from "@/lib/catalog/store";
import {
  listCities,
  listFollowUpTasks,
  listMerchants,
  listTasks,
  listVisitReports,
} from "@/lib/field-ops/store";
import type { City } from "@/lib/field-ops/types";
import { KPI_SEED } from "@/lib/kpi/data/facts-seed";
import type { KpiAgent, KpiCity, KpiDataset } from "@/lib/kpi/types";
import { listUsers } from "@/lib/rbac/users";
import type { AppUser } from "@/lib/rbac/types";

/**
 * Agent KPI repository (Tier 4).
 *
 * The only module that composes the field-ops, catalog and RBAC stores into a
 * KPI dataset. It performs no math and no authorization; the service owns the
 * rules and the controller owns the scope decision.
 */

const REP_TITLE = "مندوب ميداني";

function isFieldAgent(user: AppUser): boolean {
  return (
    user.active &&
    user.title === REP_TITLE &&
    user.permissions.includes("view_field_ops")
  );
}

export function loadKpiDataset(): KpiDataset {
  const cities = new Map(listCities().map((city) => [city.id, city]));
  const users = listUsers().filter(isFieldAgent);

  const agents: KpiAgent[] = users.flatMap((user) => {
    const cityId = user.accessibleCities[0];
    const city = cityId ? cities.get(cityId) : null;
    if (!city) return [];
    return [
      {
        id: user.id,
        name: user.name,
        team: user.team || "غير مسند",
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
          {
            id: agent.cityId,
            name: agent.cityName,
            stage: agent.stage,
          },
        ] as const;
      }),
    ).values(),
  );

  const merchants = listMerchants();
  const allowedMerchantIds = new Set(merchants.map((merchant) => merchant.id));

  return {
    cities: kpiCities,
    agents,
    merchants,
    reports: listVisitReports().filter((report) =>
      allowedMerchantIds.has(report.merchantId),
    ),
    tasks: listTasks(),
    followUps: listFollowUpTasks(),
    products: listProducts(),
    scouts: KPI_SEED.scouts.filter((entry) =>
      agents.some((agent) => agent.id === entry.agentId),
    ),
    liveOps: KPI_SEED.liveOps.filter((entry) =>
      agents.some((agent) => agent.id === entry.agentId),
    ),
    usage: KPI_SEED.usage.filter((entry) =>
      agents.some((agent) => agent.id === entry.agentId),
    ),
  };
}

/** Resolve a session user to the KPI agent record that represents them. */
export function findAgentForUser(userId: string): KpiAgent | null {
  return loadKpiDataset().agents.find((agent) => agent.id === userId) ?? null;
}

/** Cities that currently hold at least one KPI agent, for the filter bar. */
export function listKpiCities(): KpiCity[] {
  return loadKpiDataset().cities;
}

/** Agent roster used by the admin filter (id/name/team/city only). */
export function listKpiAgents(): KpiAgent[] {
  return loadKpiDataset().agents;
}
