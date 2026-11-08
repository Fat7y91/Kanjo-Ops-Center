import type { ContractState } from "@/lib/field-ops/types";

/**
 * Who a contract may be drafted for.
 *
 * A draft is the paperwork that follows a commercial agreement, so the merchant
 * must already have agreed in principle (`provisional`) or finally
 * (`final_contract`), or be flagged VIP so the commercial team can paper the
 * deal ahead of the field outcome. `no_agreement` merchants are still being
 * worked and `signed_contract` merchants already have a papered deal; neither is
 * a drafting target from this screen.
 *
 * The state must be the *resolved* one (newest of visit outcome, manager
 * override and stored column), never the possibly stale stored column.
 */
export const CONTRACT_DRAFT_ELIGIBLE_STATES = [
  "provisional",
  "final_contract",
] as const;

export function isContractDraftEligible(
  state: ContractState | string,
  vipMenu = false,
): boolean {
  if (vipMenu) return true;
  return (CONTRACT_DRAFT_ELIGIBLE_STATES as readonly string[]).includes(state);
}

/**
 * Whether a draftable merchant belongs to the viewer's cities.
 *
 * Merchants that exist only in visit history carry no city, so they cannot be
 * attributed to one city. They are treated as network-wide rather than hidden
 * from every scoped manager.
 */
export function isContractMerchantInScope(
  cityId: string | null,
  allowedCityIds: ReadonlySet<string>,
): boolean {
  return cityId === null || allowedCityIds.has(cityId);
}

/** One merchant the draft form may offer, with the reason it qualifies. */
export type ContractMerchantOption = {
  id: string;
  name: string;
  cityId: string | null;
  state: ContractState;
  vipMenu: boolean;
};
