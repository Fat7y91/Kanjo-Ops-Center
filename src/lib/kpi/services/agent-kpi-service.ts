import type {
  AgentKpiFacts,
  KpiAgent,
  KpiCity,
  KpiDataset,
  KpiRank,
  KpiScope,
  KpiSnapshot,
} from "@/lib/kpi/types";
import { KPI_STAGE_META, KpiError } from "@/lib/kpi/types";
import {
  computeFacts,
  scoreFacts,
  stageMetrics,
  usageMetrics,
} from "@/lib/kpi/metrics";
import { buildInsights } from "@/lib/kpi/insights";

/**
 * Agent KPI service (Tier 3).
 *
 * Pure domain layer: receives a fully-hydrated `KpiDataset` from the Tier 4
 * repository and returns presentation-ready snapshots. Ranking is strictly
 * city-scoped by design — never compare reps across cities or teams.
 */

const byScoreDesc = (
  left: { score: number; name: string },
  right: { score: number; name: string },
) => right.score - left.score || left.name.localeCompare(right.name, "ar");

function cityPeers(
  dataset: KpiDataset,
  agent: KpiAgent,
  factsFor: (candidate: KpiAgent) => AgentKpiFacts,
  scoreFor: (facts: AgentKpiFacts) => number,
): Array<{ agent: KpiAgent; facts: AgentKpiFacts; score: number }> {
  return dataset.agents
    .filter((candidate) => candidate.cityId === agent.cityId)
    .map((candidate) => {
      const facts = factsFor(candidate);
      return { agent: candidate, facts, score: scoreFor(facts) };
    })
    .sort((left, right) =>
      byScoreDesc(
        { score: left.score, name: left.agent.name },
        { score: right.score, name: right.agent.name },
      ),
    );
}

function rankFor(
  peers: Array<{ agent: KpiAgent; score: number }>,
  agentId: string,
  city: KpiCity,
): KpiRank {
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
): KpiSnapshot {
  const facts = computeFacts(dataset, agent);
  const score = Math.round(scoreFacts(facts, agent.stage) * 10) / 10;

  const peers = cityPeers(
    dataset,
    agent,
    (candidate) => computeFacts(dataset, candidate),
    (candidateFacts) => scoreFacts(candidateFacts, agent.stage),
  );
  const rank = rankFor(peers, agent.id, city);

  const top = peers[0] ?? null;
  const insights = buildInsights({
    agent,
    stage: agent.stage,
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
    metrics: stageMetrics(facts, agent.stage),
    usageMetrics: usageMetrics(facts),
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
 * A rep sees only themselves; a manager/admin with `agentIds` or a `team` filter
 * can widen the selection, but the scope is always intersected with the allowed
 * cities handed in from the controller.
 */
export function selectAgents(
  dataset: KpiDataset,
  scope: KpiScope,
): KpiAgent[] {
  const allowedCities = new Set(scope.cityIds);
  const requested = scope.agentIds && scope.agentIds.length > 0
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

  const snapshots = agents.map((agent) => {
    const city = cities.get(agent.cityId);
    if (!city) {
      throw new KpiError("CITY_NOT_FOUND", "مدينة المندوب غير موجودة.", 404);
    }
    return snapshotFor(dataset, agent, city);
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
  return snapshotFor(dataset, agent, city);
}

export { KPI_STAGE_META };
