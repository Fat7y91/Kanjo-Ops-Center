import { merchantSearchKey } from "@/lib/search/merchant-search";
import type { Merchant } from "@/lib/field-ops/types";
import type { MerchantCreateInput } from "@/lib/schemas/field-ops";
import { assertVendorTypeExists } from "@/lib/taxonomy/store";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  type Actor,
} from "./core";

export function listMerchants(): Merchant[] {
  return clone(getStore().merchants).sort((left, right) =>
    left.name.localeCompare(right.name, "ar"),
  );
}

export function getMerchantById(merchantId: string): Merchant | null {
  const merchant = getStore().merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  return merchant ? clone(merchant) : null;
}

export function createMerchant(
  input: MerchantCreateInput,
  _actor: Actor,
): Merchant {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === input.cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const vendorType = assertVendorTypeExists(input.vendorTypeId);

  const normalizedName = merchantSearchKey(input.name);
  const existing = store.merchants.find(
    (candidate) => candidate.normalizedName === normalizedName,
  );
  if (existing) {
    throw new FieldOpsError(
      "MERCHANT_EXISTS",
      existing.cityId === input.cityId
        ? "يوجد تاجر بهذا الاسم في المدينة بالفعل."
        : "يوجد تاجر بهذا الاسم في مدينة أخرى. استخدم اسماً مميزاً.",
      409,
    );
  }

  const merchant: Merchant = {
    id: id("m"),
    name: input.name.trim(),
    normalizedName,
    vendorTypeId: input.vendorTypeId,
    vendorType: vendorType.name_ar,
    team: null,
    cityId: input.cityId,
    targetCommission: input.targetCommission,
    monthlyValue: input.estimatedMonthlyValue,
    strategicNotes: input.strategicNotes.trim(),
    contractState: "no_agreement",
    commissionAmount: 0,
    editUnlocked: false,
    documents: [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
    lastVisitAt: null,
  };

  store.merchants.push(merchant);
  bump();
  return clone(merchant);
}
