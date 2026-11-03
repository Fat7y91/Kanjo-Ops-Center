import type {
  ContractState,
  StateOverride,
  VisitReport,
} from "@/lib/field-ops/types";

/**
 * The merchant's *current* agreement state.
 *
 * `merchant.contractState` only remembers the last value some writer stored; it
 * carries no ordering information. Both a completed visit and a manager
 * override change the agreement, so the truthful state is the newest of the
 * three sources. Reading the stored column alone leaves a merchant showing
 * "اتفاق نهائي" forever once a contract existed, even when a later visit
 * recorded "بدون تعاقد".
 */

export type MerchantStateSource = "visit" | "override" | "merchant";

/** A state change plus the moment it became true. */
export type MerchantStateEvent = {
  state: ContractState;
  at: string;
  source: MerchantStateSource;
};

const SOURCE_RANK: Record<MerchantStateSource, number> = {
  merchant: 0,
  visit: 1,
  override: 2,
};

/** When a completed visit took effect: the moment the visit closed. */
export function visitStateAt(report: VisitReport): string {
  return report.endedAt ?? report.startedAt ?? report.createdAt;
}

function isNewer(
  candidate: MerchantStateEvent,
  current: MerchantStateEvent,
): boolean {
  if (candidate.at !== current.at) return candidate.at > current.at;
  // Same timestamp: a manager override outranks the visit that preceded it.
  return SOURCE_RANK[candidate.source] > SOURCE_RANK[current.source];
}

/** Newest of the stored column and the supplied state changes. */
export function latestStateEvent(
  stored: { state: ContractState; at: string | null },
  events: readonly MerchantStateEvent[],
): MerchantStateEvent {
  let latest: MerchantStateEvent = {
    state: stored.state,
    at: stored.at ?? "",
    source: "merchant",
  };
  for (const event of events) {
    if (isNewer(event, latest)) latest = event;
  }
  return latest;
}

/**
 * Groups every state-changing event by merchant.
 *
 * One pass for the whole directory: the timeline pages can then resolve a
 * merchant's state without re-scanning the report list per row.
 */
export function stateEventsByMerchant(
  reports: readonly VisitReport[],
  overrides: readonly StateOverride[],
): Map<string, MerchantStateEvent[]> {
  const byMerchant = new Map<string, MerchantStateEvent[]>();
  const push = (merchantId: string, event: MerchantStateEvent) => {
    const bucket = byMerchant.get(merchantId);
    if (bucket) bucket.push(event);
    else byMerchant.set(merchantId, [event]);
  };

  for (const report of reports) {
    push(report.merchantId, {
      state: report.outcome,
      at: visitStateAt(report),
      source: "visit",
    });
  }
  for (const override of overrides) {
    push(override.merchantId, {
      state: override.toState,
      at: override.createdAt,
      source: "override",
    });
  }

  return byMerchant;
}

/** Convenience wrapper for a directory row. */
export function resolveMerchantState(
  merchant: { contractState: ContractState; updatedAt: string },
  events?: readonly MerchantStateEvent[],
): MerchantStateEvent {
  return latestStateEvent(
    { state: merchant.contractState, at: merchant.updatedAt },
    events ?? [],
  );
}

/**
 * One pre-computed row of `app.merchant_state_rollup`.
 *
 * The rollup is the single source of merchant state: SQL resolves the newest of
 * visit outcome, manager override and stored column once per merchant, so no
 * screen has to scan the report table. `state` is `null` only when no source
 * carries a timestamp at all, which the resolver treats as an unknown signal.
 */
export type MerchantStateRollup = {
  merchantId: string;
  state: ContractState | null;
  at: string | null;
  source: MerchantStateSource | "none";
  /** Rep who closed the visit, or manager who decided the override. */
  actor: string | null;
  visitCount: number;
  totalDurationSeconds: number;
  lastVisitAt: string | null;
  lastOutcome: ContractState | null;
  lastRepName: string | null;
};

/** The rollup row as a state event, or `null` when it carries no timestamp. */
export function stateEventFromRollup(
  rollup?: MerchantStateRollup | null,
): MerchantStateEvent | null {
  if (!rollup || !rollup.at || !rollup.state || rollup.source === "none") {
    return null;
  }
  return { state: rollup.state, at: rollup.at, source: rollup.source };
}

/**
 * Resolves a merchant's state from its rollup row.
 *
 * The stored column stays in the comparison: a rollup row exists only for
 * merchants the database has seen, and a merchant created in the current
 * session still has to render its own state honestly.
 */
export function resolveMerchantStateFromRollup(
  merchant: { contractState: ContractState; updatedAt: string },
  rollup?: MerchantStateRollup | null,
): MerchantStateEvent {
  const event = stateEventFromRollup(rollup);
  return resolveMerchantState(merchant, event ? [event] : undefined);
}

