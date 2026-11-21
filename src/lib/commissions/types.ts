/**
 * City-specific commission fee schedule (`app.commission_rates`).
 *
 * One row per city plus a single NULL-city row that acts as the global default
 * for every city without an override. `cityId` is a Firestore city document
 * id, so there is deliberately no SQL foreign key.
 *
 * The contracting fee is tiered by achievement band rather than flat:
 *   tier 1 [0, 80) · tier 2 [80, 90) · tier 3 [90, 100) · tier 4 [100, ∞)
 * `app.contract_fee_tier()` is the single definition of those boundaries.
 */
export type CityCommissionRate = {
  id: string;
  /** Firestore city document id; null marks the global fallback row. */
  cityId: string | null;
  /** Base fee for the first merchant entry. */
  merchantActivationFee: number;
  /** Fee per photo/item added. */
  photoItemFee: number;
  /** Contract fee when achievement is below 80% of target. */
  contractFeeTier1: number;
  /** Contract fee when achievement is 80% up to (not including) 90%. */
  contractFeeTier2: number;
  /** Contract fee when achievement is 90% up to (not including) 100%. */
  contractFeeTier3: number;
  /** Contract fee when achievement reaches 100% or more. */
  contractFeeTier4: number;
  updatedBy: string | null;
  updatedAt: string;
};

/** Achievement band the fee belongs to, matching `app.contract_fee_tier()`. */
export type ContractFeeTier = 1 | 2 | 3 | 4;

/** Seeded defaults from `20261031000000` / `20261102000000`; kept in sync by hand. */
export const DEFAULT_COMMISSION_RATES = {
  merchantActivationFee: 50,
  photoItemFee: 1,
  contractFeeTier1: 100,
  contractFeeTier2: 100,
  contractFeeTier3: 100,
  contractFeeTier4: 100,
} as const;

/**
 * Maps an achievement percentage to its band. Mirrors app.contract_fee_tier().
 * A null achievement (unknown, or a target of zero) is the conservative band,
 * never an unearned bonus.
 */
export function contractFeeTier(achievementPercent: number | null): ContractFeeTier {
  if (achievementPercent === null || achievementPercent < 80) return 1;
  if (achievementPercent < 90) return 2;
  if (achievementPercent < 100) return 3;
  return 4;
}
