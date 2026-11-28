import { z } from "zod";

import type { CityCommissionRate } from "./types";

/**
 * Wire contract for `GET /api/admin/commission-rates`.
 *
 * The settings screen renders one schedule per selected city plus the global
 * fallback, and the city picker is populated from the same response so the
 * shell does not have to read the geographic catalogue during SSR. Amounts are
 * validated as finite numbers: a malformed fee must fail at the boundary, not
 * be formatted into a currency string and saved back.
 */
export type ActiveCommissionRate = {
  rate: CityCommissionRate | null;
  source: "override" | "global";
};

export type CommissionCityOption = {
  id: string;
  name: string;
  governorate: string;
};

export type CommissionRatesPayload = {
  cityId: string | null;
  active: ActiveCommissionRate;
  rows: CityCommissionRate[];
  cities: CommissionCityOption[];
};

const isCommissionRatesPayload = (
  value: unknown,
): value is CommissionRatesPayload => {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.rows)) return false;
  if (!Array.isArray(payload.cities)) return false;
  return true;
};

export const commissionRatesPayloadSchema = z.custom<CommissionRatesPayload>(
  isCommissionRatesPayload,
  { message: "Commission rates payload does not match the expected shape." },
);
