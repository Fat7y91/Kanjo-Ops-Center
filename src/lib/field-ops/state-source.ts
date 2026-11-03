import {
  resolveMerchantState,
  resolveMerchantStateFromRollup,
  stateEventsByMerchant,
  type MerchantStateEvent,
  type MerchantStateRollup,
} from "./merchant-state";
import { listMerchantStateRollups } from "./merchant-state-repository";
import { loadVisitReports } from "./store/report-source";
import { listStateOverrides } from "./store/state";
import type { ContractState } from "./types";

/**
 * Single read seam for merchant agreement state.
 *
 * Every screen that shows a state badge — the directory, the catalog tiles, the
 * profile, the field-ops board — asks this module, so the badge on a tile can
 * never disagree with the badge on the profile.
 *
 * The default path reads `app.merchant_state_rollup`, where SQL has already
 * resolved the newest of visit outcome, manager override and stored column, and
 * already counted the visits. That replaced "download every visit report and
 * reduce it per merchant" on the Edge runtime, which is what pushed `/merchants`
 * past the Cloudflare Worker CPU limit.
 *
 * The in-memory derivation below is kept for deployments whose migration has not
 * been applied yet: it reproduces the same ranking over the demo store so the
 * screens stay truthful instead of blank.
 */

export type StateSourceMerchant = {
  id: string;
  contractState: ContractState;
  updatedAt: string;
};

/**
 * Resolved state for each merchant, in one database round trip.
 *
 * The returned map is keyed by merchant id and always contains every merchant
 * passed in: a merchant the database has never seen keeps its stored column,
 * which is the honest answer for a record created in the current session.
 */
export async function loadMerchantStates(
  merchants: readonly StateSourceMerchant[],
): Promise<Map<string, MerchantStateEvent>> {
  const states = new Map<string, MerchantStateEvent>();
  if (merchants.length === 0) return states;

  const rollups = await listMerchantStateRollups(
    merchants.map((merchant) => merchant.id),
  );

  if (rollups) {
    const byMerchant = new Map(rollups.map((row) => [row.merchantId, row]));
    for (const merchant of merchants) {
      states.set(
        merchant.id,
        resolveMerchantStateFromRollup(merchant, byMerchant.get(merchant.id)),
      );
    }
    return states;
  }

  const events = stateEventsByMerchant(
    await loadVisitReports(),
    listStateOverrides(),
  );
  for (const merchant of merchants) {
    states.set(merchant.id, resolveMerchantState(merchant, events.get(merchant.id)));
  }
  return states;
}

/**
 * The pre-computed counters for one merchant, or `null` when the rollup is not
 * deployed. Callers fall back to the visit list they already loaded.
 */
export async function loadMerchantRollup(
  merchantId: string,
): Promise<MerchantStateRollup | null> {
  const rollups = await listMerchantStateRollups([merchantId]);
  return rollups?.find((row) => row.merchantId === merchantId) ?? null;
}

/**
 * The resolved agreement state of one merchant.
 *
 * Used where the state is audit data rather than a badge — a visit report's
 * `previousState` — so it must reflect decisions taken by other workers, not
 * whatever the current isolate happens to remember.
 */
export async function loadMerchantState(
  merchant: StateSourceMerchant,
): Promise<ContractState> {
  const states = await loadMerchantStates([merchant]);
  return states.get(merchant.id)?.state ?? merchant.contractState;
}

export type MerchantVisitCounts = Map<string, number>;

/**
 * Visit counts for every merchant with history, or `null` when the rollup is
 * not deployed.
 *
 * Search annotates each hit with its visit count; counting them by downloading
 * every report is what made the search endpoint expensive.
 */
export async function loadMerchantVisitCounts(): Promise<
  MerchantVisitCounts | null
> {
  const rollups = await listMerchantStateRollups();
  if (!rollups) return null;
  return new Map(rollups.map((row) => [row.merchantId, row.visitCount]));
}
