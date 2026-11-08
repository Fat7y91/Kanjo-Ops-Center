import "server-only";

import { effectiveCityIds } from "@/lib/city-scope-query";
import {
  isContractDraftEligible,
  isContractMerchantInScope,
  type ContractMerchantOption,
} from "@/lib/contracts/eligibility";
import {
  resolveMerchantStateFromRollup,
  type MerchantStateRollup,
} from "@/lib/field-ops/merchant-state";
import { listMerchantStateRollups } from "@/lib/field-ops/merchant-state-repository";
import { listMerchantV1Flags } from "@/lib/field-ops/merchant-profile-repository";
import { listVisitMerchantNames } from "@/lib/field-ops/reports-repository";
import { listTaskMerchantCities } from "@/lib/field-ops/task-merchant-city-repository";
import { loadMerchantStates } from "@/lib/field-ops/state-source";
import { listMerchants } from "@/lib/field-ops/store";
import type { ContractState, Merchant } from "@/lib/field-ops/types";
import type { ActiveSession } from "@/lib/rbac/types";

/**
 * The merchants a contract may be drafted for, scoped to the session's cities.
 *
 * Two sources are unioned:
 *
 * 1. `app.merchants` rows the viewer can see, kept only when their *resolved*
 *    agreement state (newest of visit outcome, manager override and stored
 *    column) is `provisional`/`final_contract`, or when the VIP flag is set.
 *    The stored column alone is not trusted: it can lag the field outcome.
 * 2. Merchants that exist only in `app.visit_reports`/`merchant_state_rollup`
 *    (the V1 seed catalogue never migrated into `app.merchants`). Their state is
 *    already resolved by the rollup, their name is read from the newest visit,
 *    and their city is taken from the visit task when one exists. With no city
 *    they are network-wide, so a scoped manager can still paper them.
 *
 * The rollup is read once: it resolves both the real merchants and the
 * orphaned ones. Only when it is not deployed does the loader fall back to
 * deriving the real merchants' state from the report/override tables, and in
 * that case there are no orphaned rollup rows to add.
 *
 * `POST /api/contracts` re-derives this list, so a hand-crafted request cannot
 * draft a contract for an ineligible merchant.
 */
export async function listContractDraftMerchants(
  session: ActiveSession,
): Promise<ContractMerchantOption[]> {
  const allowed = new Set(await effectiveCityIds(session));
  const merchants = await listMerchants();

  const [flags, rollups] = await Promise.all([
    listMerchantV1Flags(),
    listMerchantStateRollups(),
  ]);
  const states = await resolveStates(merchants, rollups);

  const options = new Map<string, ContractMerchantOption>();

  for (const merchant of merchants) {
    if (!isContractMerchantInScope(merchant.cityId, allowed)) continue;
    const state = states.get(merchant.id) ?? merchant.contractState;
    const vipMenu = flags.get(merchant.id)?.vipMenu ?? false;
    if (!isContractDraftEligible(state, vipMenu)) continue;
    options.set(merchant.id, {
      id: merchant.id,
      name: merchant.name,
      cityId: merchant.cityId,
      state,
      vipMenu,
    });
  }

  if (rollups) {
    await addOrphanedMerchants({
      options,
      rollups,
      known: new Set(merchants.map((merchant) => merchant.id)),
      flags,
      allowed,
    });
  }

  return [...options.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "ar"),
  );
}

/**
 * Resolved agreement state per real merchant.
 *
 * Reuses the one rollup read the orphan scan already needs; falls back to the
 * shared state seam only when the rollup view is not deployed.
 */
async function resolveStates(
  merchants: readonly Merchant[],
  rollups: readonly MerchantStateRollup[] | null,
): Promise<Map<string, ContractState>> {
  if (!rollups) {
    const events = await loadMerchantStates(merchants);
    return new Map(
      merchants.map((merchant) => [
        merchant.id,
        events.get(merchant.id)?.state ?? merchant.contractState,
      ]),
    );
  }

  const byMerchant = new Map(rollups.map((row) => [row.merchantId, row]));
  return new Map(
    merchants.map((merchant) => [
      merchant.id,
      resolveMerchantStateFromRollup(merchant, byMerchant.get(merchant.id))
        .state,
    ]),
  );
}

/** Adds the eligible merchants that exist only in visit history/rollup. */
async function addOrphanedMerchants(input: {
  options: Map<string, ContractMerchantOption>;
  rollups: readonly MerchantStateRollup[];
  known: ReadonlySet<string>;
  flags: ReadonlyMap<string, { vipMenu: boolean }>;
  allowed: ReadonlySet<string>;
}): Promise<void> {
  const { options, rollups, known, flags, allowed } = input;
  const orphanIds = rollups
    .filter((rollup) => !known.has(rollup.merchantId))
    .map((rollup) => rollup.merchantId);
  if (orphanIds.length === 0) return;

  const orphanSet = new Set(orphanIds);
  const [names, cities] = await Promise.all([
    listVisitMerchantNames(orphanIds),
    listTaskMerchantCities(orphanIds),
  ]);

  for (const rollup of rollups) {
    if (!orphanSet.has(rollup.merchantId)) continue;
    const vipMenu = flags.get(rollup.merchantId)?.vipMenu ?? false;
    const state: ContractState = rollup.state ?? "no_agreement";
    if (!isContractDraftEligible(state, vipMenu)) continue;
    const cityId = cities.get(rollup.merchantId) ?? null;
    if (!isContractMerchantInScope(cityId, allowed)) continue;
    const name = names.get(rollup.merchantId)?.trim() || rollup.merchantId;
    options.set(rollup.merchantId, {
      id: rollup.merchantId,
      name,
      cityId,
      state,
      vipMenu,
    });
  }
}

/** The eligible option for one merchant, or `null` when drafting is not allowed. */
export async function findContractDraftMerchant(
  session: ActiveSession,
  merchantId: string,
): Promise<ContractMerchantOption | null> {
  const options = await listContractDraftMerchants(session);
  return options.find((option) => option.id === merchantId) ?? null;
}

