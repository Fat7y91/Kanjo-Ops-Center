import { merchantSearchKey } from "@/lib/search/merchant-search";
import type { Merchant } from "@/lib/field-ops/types";
import type {
  MerchantCreateInput,
  MerchantUpdateInput,
} from "@/lib/schemas/field-ops";
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
  updateMerchantRow,
} from "../merchant-repository";
import type { MerchantPatch } from "../merchant-patch";
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
  const merchants = (await listMerchantRows()).filter(
    (merchant) => !merchant.archivedAt,
  );
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
    coverUrl: null,
    phone: null,
    address: null,
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
    archivedAt: null,
  };

  return insertMerchant({ merchant, createdBy: actor.id });
}

/**
 * Applies a manual correction to a merchant's core details.
 *
 * Name, phone, address, vendor type, city, target commission and strategic
 * notes are the fields an operator repairs from the profile. Contract state is
 * intentionally excluded: it transitions through the audited state workflow so
 * the append-only override trail stays complete.
 */
export async function updateMerchantDetails(
  merchantId: string,
  input: MerchantUpdateInput,
): Promise<Merchant> {
  const current = await requireMerchant(merchantId);

  const patch: MerchantPatch = {};

  if (input.name !== undefined && input.name !== current.name) {
    const normalizedName = merchantSearchKey(input.name);
    const existing = await findMerchantByNormalizedName(normalizedName);
    if (existing && existing.id !== merchantId) {
      throw new FieldOpsError(
        "MERCHANT_EXISTS",
        existing.cityId === (input.cityId ?? current.cityId)
          ? "يوجد تاجر بهذا الاسم في المدينة بالفعل."
          : "يوجد تاجر بهذا الاسم في مدينة أخرى. استخدم اسماً مميزاً.",
        409,
      );
    }
    patch.name = input.name.trim();
    patch.normalizedName = normalizedName;
  }

  if (input.cityId !== undefined && input.cityId !== current.cityId) {
    const city = await getCityById(input.cityId);
    if (!city) {
      throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
    }
    patch.cityId = input.cityId;
  }

  if (
    input.vendorTypeId !== undefined &&
    input.vendorTypeId !== current.vendorTypeId
  ) {
    const vendorType = assertVendorTypeExists(input.vendorTypeId);
    patch.vendorTypeId = input.vendorTypeId;
    patch.vendorType = vendorType.name_ar;
  }

  if (input.targetCommission !== undefined) {
    patch.targetCommission = input.targetCommission;
  }
  if (input.strategicNotes !== undefined) {
    patch.strategicNotes = input.strategicNotes.trim();
  }
  if (input.phone !== undefined) {
    patch.phone = input.phone.trim() === "" ? null : input.phone.trim();
  }
  if (input.address !== undefined) {
    patch.address = input.address.trim() === "" ? null : input.address.trim();
  }

  const updated = await updateMerchantRow(merchantId, patch);
  if (!updated) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  return updated;
}
