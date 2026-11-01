import { commissionRateUpsertSchema } from "@/lib/schemas/commission-rates";
import {
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";

import {
  findCommissionRateRow,
  insertCommissionRateRow,
  isCommissionRatesDatabaseConfigured,
  listCommissionRateRows,
  updateCommissionRateRow,
  type CommissionRateRow,
} from "./repository";
import {
  DEFAULT_COMMISSION_RATES,
  type CityCommissionRate,
} from "./types";

/**
 * Tier 3 business rules for the commission fee schedule.
 *
 * The lookup rule mirrors `app.commission_rates_for()`: a city's own row when
 * present, otherwise the NULL-city fallback. Two rows are never merged, so an
 * override is a complete configuration rather than a partial one.
 */

export class CommissionRatesError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CommissionRatesError";
    this.code = code;
    this.status = status;
  }
}

export function toCityCommissionRate(
  row: CommissionRateRow,
): CityCommissionRate {
  return {
    id: row.id,
    cityId: row.city_id,
    merchantActivationFee: Number(row.merchant_activation_fee),
    photoItemFee: Number(row.photo_item_fee),
    // NULL only when the deployment predates the contracting migration; the
    // seeded default is the honest stand-in for display.
    contractingBaseFee:
      row.contracting_base_fee === null
        ? DEFAULT_COMMISSION_RATES.contractingBaseFee
        : Number(row.contracting_base_fee),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export function globalRate(
  rows: readonly CityCommissionRate[],
): CityCommissionRate | null {
  return rows.find((rate) => rate.cityId === null) ?? null;
}

export type ResolvedCommissionRate = {
  rate: CityCommissionRate | null;
  source: "override" | "global";
};

/** Resolves the active schedule for a city: override first, then the fallback. */
export function activeRateForCity(
  rows: readonly CityCommissionRate[],
  cityId: string | null,
): ResolvedCommissionRate {
  if (cityId) {
    const override = rows.find((rate) => rate.cityId === cityId);
    if (override) return { rate: override, source: "override" };
  }
  return { rate: globalRate(rows), source: "global" };
}

/** Active schedule plus the full row list, for the settings surface. */
export async function loadActiveCommissionRate(cityId: string | null): Promise<{
  active: ResolvedCommissionRate;
  rows: CityCommissionRate[];
}> {
  if (!isCommissionRatesDatabaseConfigured()) {
    throw new CommissionRatesError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات المالية غير متصلة.",
      503,
    );
  }

  const rows = ((await listCommissionRateRows()) ?? []).map(toCityCommissionRate);
  return { active: activeRateForCity(rows, cityId), rows };
}

/**
 * Saves a schedule for a city (null city writes the global fallback).
 *
 * The write is insert-or-update: a city that has no row yet gets one, an
 * existing row is updated in place. The per-city partial unique index makes a
 * racing insert possible, so a unique violation falls back to updating the
 * row the peer just created instead of failing the save.
 */
export async function saveCommissionRate(
  session: { user: { id: string } },
  rawInput: unknown,
): Promise<{ rate: CityCommissionRate; created: boolean }> {
  if (!isCommissionRatesDatabaseConfigured()) {
    throw new CommissionRatesError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات المالية غير متصلة.",
      503,
    );
  }

  const input = commissionRateUpsertSchema.parse(rawInput);
  const write = {
    merchantActivationFee: input.merchantActivationFee,
    photoItemFee: input.photoItemFee,
    contractingBaseFee: input.contractingBaseFee,
    updatedBy: session.user.id,
  };

  try {
    const existing = await findCommissionRateRow(input.cityId);
    if (existing) {
      const updated = await updateCommissionRateRow(existing.id, write);
      return { rate: toCityCommissionRate(updated), created: false };
    }

    try {
      const inserted = await insertCommissionRateRow({
        cityId: input.cityId,
        ...write,
      });
      return { rate: toCityCommissionRate(inserted), created: true };
    } catch (insertError) {
      if (!isUniqueViolation(insertError)) throw insertError;
      // A peer saved the same city between the lookup and the insert.
      const row = await findCommissionRateRow(input.cityId);
      if (!row) throw insertError;
      const updated = await updateCommissionRateRow(row.id, write);
      return { rate: toCityCommissionRate(updated), created: false };
    }
  } catch (error) {
    if (error instanceof CommissionRatesError) throw error;
    if (isMissingSchemaObject(error)) {
      throw new CommissionRatesError(
        "STORE_UNAVAILABLE",
        "إدارة الأسعار غير مُفعّلة على هذا النشر بعد.",
        503,
      );
    }
    throw error;
  }
}
