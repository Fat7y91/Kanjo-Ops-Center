import type {
  ContractState,
  FollowUpTask,
  MerchantDocument,
  RepOpinion,
  StateOverride,
  VisitContact,
  VisitReport,
} from "@/lib/field-ops/types";

import { clone, getStore } from "./core";

export function calculateCommission(
  monthlyValue: number,
  targetCommission: number,
): number {
  return Math.round(monthlyValue * targetCommission) / 100;
}

/**
 * Merge weighted opinions for the CRM roll-up.
 *
 * Each trait keeps ONE entry on the merchant: the highest weight ever recorded.
 * That way a rep flipping "cooperative" from 80% down to 20% on a later visit
 * does not erase the earlier strong signal, but a stronger read always wins.
 * Custom traits are keyed by their normalized label so the same wording
 * accumulates instead of producing duplicates.
 */
export function mergeOpinions(
  existing: RepOpinion[],
  incoming: RepOpinion[],
): RepOpinion[] {
  const merged = new Map<string, RepOpinion>();
  const keyFor = (opinion: RepOpinion) =>
    opinion.trait === "custom"
      ? `custom:${(opinion.label ?? "").trim().toLowerCase()}`
      : opinion.trait;

  for (const opinion of existing) {
    const key = keyFor(opinion);
    const current = merged.get(key);
    if (!current || opinion.weight > current.weight) merged.set(key, { ...opinion });
  }
  for (const opinion of incoming) {
    const key = keyFor(opinion);
    if (!key || key === "custom:") continue;
    const current = merged.get(key);
    if (!current || opinion.weight > current.weight) {
      merged.set(key, { ...opinion });
    }
  }
  return Array.from(merged.values()).sort((left, right) => right.weight - left.weight);
}

/**
 * Chronological, cross-rep CRM timeline for a merchant card.
 *
 * Unlike the field-ops board (which is task-centric and team-filtered), this is
 * the single source for a manager reading a merchant's full history.
 */
export type MerchantTimelineEntry =
  | { kind: "visit"; at: string; report: VisitReport }
  | { kind: "override"; at: string; override: StateOverride }
  | { kind: "document"; at: string; document: MerchantDocument }
  | { kind: "follow_up"; at: string; followUp: FollowUpTask };

export function merchantTimeline(merchantId: string): MerchantTimelineEntry[] {
  const store = getStore();
  const entries: MerchantTimelineEntry[] = [];

  for (const report of store.reports) {
    if (report.merchantId === merchantId) {
      entries.push({
        kind: "visit",
        at: report.endedAt ?? report.createdAt,
        report: clone(report),
      });
    }
  }
  for (const override of store.overrides) {
    if (override.merchantId === merchantId) {
      entries.push({
        kind: "override",
        at: override.createdAt,
        override: clone(override),
      });
    }
  }
  for (const document of store.merchants.find((m) => m.id === merchantId)?.documents ?? []) {
    entries.push({
      kind: "document",
      at: document.uploadedAt,
      document: clone(document),
    });
  }
  for (const followUp of store.followUps ?? []) {
    if (followUp.merchantId === merchantId) {
      entries.push({
        kind: "follow_up",
        at: followUp.createdAt,
        followUp: clone(followUp),
      });
    }
  }

  return entries.sort((left, right) => right.at.localeCompare(left.at));
}

export type MerchantCrmSummary = {
  visitCount: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  lastVisitAt: string | null;
  lastOutcome: ContractState | null;
  opinions: RepOpinion[];
  contact: VisitContact | null;
  contactUpdatedAt: string | null;
  reps: string[];
  nextFollowUpAt: string | null;
};

export function merchantCrmSummary(merchantId: string): MerchantCrmSummary {
  const merchant = getStore().merchants.find((m) => m.id === merchantId);
  const visits = getStore().reports.filter(
    (report) => report.merchantId === merchantId,
  );
  const totalDuration = visits.reduce(
    (sum, report) => sum + (report.durationSeconds ?? 0),
    0,
  );
  const timed = visits.filter((report) => report.durationSeconds != null);
  const reps = Array.from(new Set(visits.map((report) => report.repName)));
  const sortedVisits = [...visits].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const openFollowUps = (getStore().followUps ?? [])
    .filter(
      (task) => task.merchantId === merchantId && task.status === "scheduled",
    )
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));

  return {
    visitCount: visits.length,
    totalDurationSeconds: totalDuration,
    averageDurationSeconds:
      timed.length > 0
        ? Math.round(
            timed.reduce((sum, report) => sum + (report.durationSeconds ?? 0), 0) /
              timed.length,
          )
        : 0,
    lastVisitAt: merchant?.lastVisitAt ?? null,
    lastOutcome: sortedVisits[0]?.outcome ?? null,
    opinions: [...(merchant?.opinions ?? [])].sort(
      (left, right) => right.weight - left.weight,
    ),
    contact: merchant?.contact ?? null,
    contactUpdatedAt: merchant?.contactUpdatedAt ?? null,
    reps,
    nextFollowUpAt: openFollowUps[0]?.dueAt ?? null,
  };
}
