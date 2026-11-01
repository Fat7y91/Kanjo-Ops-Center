/**
 * City-specific commission fee schedule (`app.commission_rates`).
 *
 * One row per city plus a single NULL-city row that acts as the global default
 * for every city without an override. `cityId` is a Firestore city document
 * id, so there is deliberately no SQL foreign key.
 */
export type CityCommissionRate = {
  id: string;
  /** Firestore city document id; null marks the global fallback row. */
  cityId: string | null;
  /** Base fee for the first merchant entry. */
  merchantActivationFee: number;
  /** Fee per photo/item added. */
  photoItemFee: number;
  /** Base fee for closing a contract, before the margin is applied. */
  contractingBaseFee: number;
  updatedBy: string | null;
  updatedAt: string;
};

/** Seeded defaults from `20261031000000` / `20261031000003`; kept in sync by hand. */
export const DEFAULT_COMMISSION_RATES = {
  merchantActivationFee: 50,
  photoItemFee: 1,
  contractingBaseFee: 100,
} as const;
