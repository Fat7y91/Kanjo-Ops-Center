import type {
  KpiAgent,
  KpiCity,
  KpiDataset,
  KpiRank,
  KpiRankFact,
  KpiScope,
  KpiSnapshot,
  KpiVaultFacts,
} from "@/lib/kpi/types";
import { KPI_STAGE_META, KpiError } from "@/lib/kpi/types";
import { factsFor, scoreVaultFacts, vaultMetrics } from "@/lib/kpi/metrics";
import { buildInsights } from "@/lib/kpi/insights";

/**
 * Agent KPI service (Tier 3).
 *
 * Pure domain layer: receives a fully-hydrated `KpiDataset` from the Tier 4
 * repository and returns presentation-ready snapshots. Ranking is strictly
 * city-scoped by design — never compare reps across cities or teams.
 *
 * The city peer table is built once per report. The previous version rebuilt
 * and re-sorted it for every snapshot, making a report O(agents² × city). The
 * live-month rank also comes pre-computed from `app.agent_kpi_rank_rollup` when
 * the view is deployed; the local sort remains the fallback for snapshots and
 * local dev.
 */

const byScoreDesc = (
  left: { score: number; name: string },
  right: { score: number; name: string },
) => right.score - left.score || left.name.localeCompare(right.name, "ar");

type CityPeer = { agent: KpiAgent; facts: KpiVaultFacts; score: number };

type CityIndex = Map<string, CityPeer[]>;

function buildCityIndex(dataset: KpiDataset): CityIndex {
  const index: CityIndex = new Map();
  for (const agent of dataset.agents) {
    const facts = factsFor(dataset, agent);
    const peer: CityPeer = {
      agent,
      facts,
      score: scoreVaultFacts(facts),
    };
    const bucket = index.get(agent.cityId);
    if (bucket) bucket.push(peer);
    else index.set(agent.cityId, [peer]);
  }
  for (const bucket of index.values()) {
    bucket.sort((left, right) =>
      byScoreDesc(
        { score: left.score, name: left.agent.name },
        { score: right.score, name: right.agent.name },
      ),
    );
  }
  return index;
}

function rankFor(
  peers: CityPeer[],
  agentId: string,
  city: KpiCity,
  rollup: KpiRankFact | undefined,
): KpiRank {
  // The rollup ranks by the rep's first `user_city_scope` row. If the roster
  // resolved a different city for this rep, the pre-computed rank describes a
  // different peer set, so fall back to the local sort instead of mixing them.
  if (rollup && rollup.cityId === city.id) {
    return {
      position: rollup.position,
      total: rollup.total,
      cityId: city.id,
      cityName: city.name,
    };
  }
  const position = peers.findIndex((peer) => peer.agent.id === agentId) + 1;
  return {
    position: position > 0 ? position : peers.length,
    total: peers.length,
    cityId: city.id,
    cityName: city.name,
  };
}

function snapshotFor(
  dataset: KpiDataset,
  agent: KpiAgent,
  city: KpiCity,
  peers: CityPeer[],
): KpiSnapshot {
  const self = peers.find((peer) => peer.agent.id === agent.id);
  const facts = self?.facts ?? factsFor(dataset, agent);
  const score = Math.round(scoreVaultFacts(facts) * 10) / 10;
  const rank = rankFor(peers, agent.id, city, dataset.ranksByRep.get(agent.id));

  const top = peers[0] ?? null;
  const insights = buildInsights({
    agent,
    facts,
    top: top ? { name: top.agent.name, facts: top.facts, score: top.score } : null,
    score,
    rank: rank.position,
    rankTotal: rank.total,
  });

  return {
    agent,
    stage: agent.stage,
    stageLabel: KPI_STAGE_META[agent.stage].label,
    facts,
    metrics: vaultMetrics(facts),
    score,
    rank,
    topPerformer: top
      ? {
          agentId: top.agent.id,
          name: top.agent.name,
          score: Math.round(top.score * 10) / 10,
          isSelf: top.agent.id === agent.id,
        }
      : {
          agentId: agent.id,
          name: agent.name,
          score,
          isSelf: true,
        },
    insights,
  };
}

/**
 * Resolve the agents a viewer may inspect.
 *
 * A rep sees only themselves; a manager/admin with `agentIds` or a `team`
 * filter can widen the selection, but the scope is always intersected with the
 * allowed cities handed in from the controller.
 */
export function selectAgents(
  dataset: KpiDataset,
  scope: KpiScope,
): KpiAgent[] {
  const allowedCities = new Set(scope.cityIds);
  const requested =
    scope.agentIds && scope.agentIds.length > 0
      ? new Set(scope.agentIds)
      : null;

  const agents = dataset.agents.filter((agent) => {
    if (!allowedCities.has(agent.cityId)) return false;
    if (scope.team && agent.team !== scope.team) return false;
    if (requested && !requested.has(agent.id)) return false;
    return true;
  });

  if (agents.length === 0) {
    throw new KpiError(
      "EMPTY_SCOPE",
      "لا يوجد مناديب مطابقون لهذا النطاق.",
      404,
    );
  }
  return agents;
}

export function buildKpiReport(
  dataset: KpiDataset,
  scope: KpiScope,
  viewerAgentId: string,
): { snapshots: KpiSnapshot[]; generatedFor: string; cityCount: number } {
  const agents = selectAgents(dataset, scope);
  const cities = new Map(dataset.cities.map((city) => [city.id, city]));
  const index = buildCityIndex(dataset);

  const snapshots = agents.map((agent) => {
    const city = cities.get(agent.cityId);
    if (!city) {
      throw new KpiError("CITY_NOT_FOUND", "مدينة المندوب غير موجودة.", 404);
    }
    return snapshotFor(dataset, agent, city, index.get(agent.cityId) ?? []);
  });

  const ordered = [
    ...snapshots.filter((snapshot) => snapshot.agent.id === viewerAgentId),
    ...snapshots.filter((snapshot) => snapshot.agent.id !== viewerAgentId),
  ];

  return {
    snapshots: ordered,
    generatedFor: viewerAgentId,
    cityCount: new Set(agents.map((agent) => agent.cityId)).size,
  };
}

export function getAgentSnapshot(
  dataset: KpiDataset,
  agentId: string,
  allowedCityIds: readonly string[],
): KpiSnapshot {
  const agent = dataset.agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    throw new KpiError("AGENT_NOT_FOUND", "المندوب غير موجود.", 404);
  }
  if (!allowedCityIds.includes(agent.cityId)) {
    throw new KpiError("AGENT_NOT_FOUND", "المندوب خارج نطاق مدنك.", 404);
  }
  const city = dataset.cities.find((candidate) => candidate.id === agent.cityId);
  if (!city) {
    throw new KpiError("CITY_NOT_FOUND", "مدينة المندوب غير موجودة.", 404);
  }
  const peers = buildCityIndex(dataset).get(agent.cityId) ?? [];
  return snapshotFor(dataset, agent, city, peers);
}

export { KPI_STAGE_META };
