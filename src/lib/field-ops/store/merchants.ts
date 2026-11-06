import { merchantSearchKey } from "@/lib/search/merchant-search";
import type { Merchant } from "@/lib/field-ops/types";
import type { MerchantCreateInput } from "@/lib/schemas/field-ops";
import { assertVendorTypeExists } from "@/lib/taxonomy/store";

import {
  FieldOpsError,
  isoNow,
  type Actor,
} from "./core";
import {
  findMerchantByNormalizedName,
  getMerchantRow,
  insertMerchant,
  listMerchantRows,
} from "../merchant-repository";
import { getCityById } from "./cities";

/**
 * Merchant reads and creation, backed by `app.merchants`.
 *
 * The directory used to be a process-local seed. That meant two workers could
 * disagree about the network, a restart lost every merchant, and payroll (which
 * already read SQL) saw a different list than `/merchants`. The table is now the
 * single source of truth; this module owns the domain rules and the repository
 * owns the columns.
 */

export async function listMerchants(): Promise<Merchant[]> {
  const merchants = await listMerchantRows();
  return merchants.sort((left, right) =>
    left.name.localeCompare(right.name, "ar"),
  );
}

export async function getMerchantById(
  merchantId: string,
): Promise<Merchant | null> {
  return getMerchantRow(merchantId);
}

/** Merchant or a typed 404, for the write paths that require one. */
export async function requireMerchant(merchantId: string): Promise<Merchant> {
  const merchant = await getMerchantRow(merchantId);
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  return merchant;
}

export async function createMerchant(
  input: MerchantCreateInput,
  actor: Actor,
): Promise<Merchant> {
  const city = await getCityById(input.cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const vendorType = assertVendorTypeExists(input.vendorTypeId);

  const normalizedName = merchantSearchKey(input.name);
  const existing = await findMerchantByNormalizedName(normalizedName);
  if (existing) {
    throw new FieldOpsError(
      "MERCHANT_EXISTS",
      existing.cityId === input.cityId
        ? "يوجد تاجر بهذا الاسم في المدينة بالفعل."
        : "يوجد تاجر بهذا الاسم في مدينة أخرى. استخدم اسماً مميزاً.",
      409,
    );
  }

  const now = isoNow();
  const merchant: Merchant = {
    id: `m-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    normalizedName,
    vendorTypeId: input.vendorTypeId,
    vendorType: vendorType.name_ar,
    team: null,
    cityId: input.cityId,
    logoUrl: null,
    targetCommission: input.targetCommission,
    monthlyValue: input.estimatedMonthlyValue,
    strategicNotes: input.strategicNotes.trim(),
    contractState: "no_agreement",
    commissionAmount: 0,
    editUnlocked: false,
    documents: [],
    createdAt: now,
    updatedAt: now,
    lastVisitAt: null,
  };

  return insertMerchant({ merchant, createdBy: actor.id });
}
